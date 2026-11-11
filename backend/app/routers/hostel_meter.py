"""
Hostel meter readings router for BillShield API.
Enforces:
  - non-negative readings, units, and amount
  - cumulative end > start and continuity across periods when start/end entered
  - no duplicate readings for the same room & period
  - mandatory source tag ("Manual Entry", "Simulated Demo Data", "Sensor (Future)")
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import BillingPeriod, HostelMeterReading, Room, Settings, _now_ist
from app.schemas import HostelMeterReadingCreate, HostelMeterReadingOut, HostelMeterReadingUpdate
from app.services.bootstrap import sync_period_verification_if_paired

router = APIRouter(tags=["hostel-meter"])


def _validate_hostel_continuity(
    db: Session,
    room_id: int,
    bp: BillingPeriod,
    reading_start: float,
    reading_end: float,
    exclude_reading_id: Optional[int] = None,
) -> float:
    """Validate cumulative hostel meter start/end values and return billed_units."""
    if reading_start < 0 or reading_end < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Hostel meter readings cannot be negative",
        )
    if reading_end <= reading_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Hostel meter ending reading must be greater than starting reading",
        )

    existing_hostel = list(
        db.scalars(
            select(HostelMeterReading)
            .join(BillingPeriod, HostelMeterReading.billing_period_id == BillingPeriod.id)
            .where(HostelMeterReading.room_id == room_id)
            .order_by(BillingPeriod.period_start)
        ).all()
    )
    for hr in existing_hostel:
        if exclude_reading_id is not None and hr.id == exclude_reading_id:
            continue
        if hr.reading_end is not None and hr.billing_period.period_end <= bp.period_start:
            if reading_start < hr.reading_end:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Cumulative hostel meter reading cannot decrease: reading_start ({reading_start}) "
                        f"is lower than previous period end reading ({hr.reading_end}) for '{hr.billing_period.label}'"
                    ),
                )
        if hr.reading_start is not None and hr.billing_period.period_start >= bp.period_end:
            if reading_end > hr.reading_start:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Cumulative hostel meter reading cannot decrease: reading_end ({reading_end}) "
                        f"exceeds subsequent period start reading ({hr.reading_start}) for '{hr.billing_period.label}'"
                    ),
                )

    return round(reading_end - reading_start, 4)


@router.get(
    "/rooms/{room_id}/hostel-readings",
    response_model=list[HostelMeterReadingOut],
    summary="List official hostel meter readings for a room",
)
def list_hostel_meter_readings(
    room_id: int,
    db: Session = Depends(get_db),
) -> list[HostelMeterReading]:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )

    stmt = (
        select(HostelMeterReading)
        .options(selectinload(HostelMeterReading.billing_period))
        .join(BillingPeriod, HostelMeterReading.billing_period_id == BillingPeriod.id)
        .where(HostelMeterReading.room_id == room_id)
        .order_by(BillingPeriod.period_start.desc())
    )
    return list(db.scalars(stmt).all())


@router.post(
    "/rooms/{room_id}/hostel-readings",
    response_model=HostelMeterReadingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add an official hostel meter reading for a room",
)
def add_hostel_meter_reading(
    room_id: int,
    payload: HostelMeterReadingCreate,
    db: Session = Depends(get_db),
) -> HostelMeterReading:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )

    bp = db.get(BillingPeriod, payload.billing_period_id)
    if not bp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Billing period with id {payload.billing_period_id} not found",
        )

    existing = db.scalar(
        select(HostelMeterReading).where(
            HostelMeterReading.room_id == room_id,
            HostelMeterReading.billing_period_id == payload.billing_period_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Hostel meter reading for room {room.room_number} during period '{bp.label}' already exists",
        )

    if payload.reading_start is not None and payload.reading_end is not None:
        billed_units = _validate_hostel_continuity(
            db, room_id, bp, payload.reading_start, payload.reading_end
        )
    else:
        billed_units = payload.billed_units if payload.billed_units is not None else 0.0

    if billed_units < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Billed units cannot be negative",
        )

    settings = db.get(Settings, 1)
    rate = settings.rate_per_unit if settings else 10.0
    billed_amount = (
        payload.billed_amount
        if payload.billed_amount is not None
        else round(billed_units * rate, 2)
    )

    if billed_amount < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Billed amount cannot be negative",
        )

    reading = HostelMeterReading(
        room_id=room_id,
        billing_period_id=payload.billing_period_id,
        reading_start=payload.reading_start,
        reading_end=payload.reading_end,
        billed_units=billed_units,
        billed_amount=billed_amount,
        source=payload.source.value,
        notes=payload.notes,
        recorded_at=payload.recorded_at or _now_ist(),
    )
    db.add(reading)
    db.flush()
    sync_period_verification_if_paired(db, room_id, payload.billing_period_id)
    db.commit()
    db.refresh(reading)
    db.refresh(reading, ["billing_period"])
    return reading


@router.put(
    "/hostel-readings/{reading_id}",
    response_model=HostelMeterReadingOut,
    summary="Update an official hostel meter reading",
)
def update_hostel_meter_reading(
    reading_id: int,
    payload: HostelMeterReadingUpdate,
    db: Session = Depends(get_db),
) -> HostelMeterReading:
    reading = db.scalar(
        select(HostelMeterReading)
        .options(selectinload(HostelMeterReading.billing_period))
        .where(HostelMeterReading.id == reading_id)
    )
    if not reading:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hostel meter reading with id {reading_id} not found",
        )

    next_start = payload.reading_start if payload.reading_start is not None else reading.reading_start
    next_end = payload.reading_end if payload.reading_end is not None else reading.reading_end

    if (next_start is None) != (next_end is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both reading_start and reading_end must be set together",
        )

    units_changed = False
    if next_start is not None and next_end is not None:
        new_units = _validate_hostel_continuity(
            db, reading.room_id, reading.billing_period, next_start, next_end, exclude_reading_id=reading.id
        )
        reading.reading_start = next_start
        reading.reading_end = next_end
        units_changed = new_units != reading.billed_units
        reading.billed_units = new_units
    elif payload.billed_units is not None:
        if payload.billed_units < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Billed units cannot be negative",
            )
        units_changed = payload.billed_units != reading.billed_units
        reading.billed_units = payload.billed_units

    if payload.billed_amount is not None:
        if payload.billed_amount < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Billed amount cannot be negative",
            )
        reading.billed_amount = payload.billed_amount
    elif units_changed:
        settings = db.get(Settings, 1)
        rate = settings.rate_per_unit if settings else 10.0
        reading.billed_amount = round(reading.billed_units * rate, 2)

    if payload.recorded_at is not None:
        reading.recorded_at = payload.recorded_at
    if payload.notes is not None:
        reading.notes = payload.notes.strip() or None

    db.flush()
    sync_period_verification_if_paired(db, reading.room_id, reading.billing_period_id)
    db.commit()
    db.refresh(reading)
    db.refresh(reading, ["billing_period"])
    return reading


@router.delete(
    "/hostel-readings/{reading_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a hostel meter reading",
)
def delete_hostel_meter_reading(
    reading_id: int,
    db: Session = Depends(get_db),
) -> None:
    reading = db.get(HostelMeterReading, reading_id)
    if not reading:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hostel meter reading with id {reading_id} not found",
        )
    room_id, period_id = reading.room_id, reading.billing_period_id
    db.delete(reading)
    db.flush()
    sync_period_verification_if_paired(db, room_id, period_id)
    db.commit()
