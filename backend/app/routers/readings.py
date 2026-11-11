"""
Room readings router for BillShield API.
Enforces:
  - no negatives
  - reading_end > reading_start
  - non-decreasing cumulative readings across periods
  - no duplicate readings for the same room & period
  - mandatory source tag ("Manual Entry", "Simulated Demo Data", "Sensor (Future)")
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import BillingPeriod, Room, RoomReading, _now_ist
from app.schemas import RoomReadingCreate, RoomReadingOut, RoomReadingUpdate
from app.services.bootstrap import sync_period_verification_if_paired

router = APIRouter(tags=["readings"])


def _validate_room_continuity(
    db: Session,
    room_id: int,
    bp: BillingPeriod,
    reading_start: float,
    reading_end: float,
    exclude_reading_id: Optional[int] = None,
) -> None:
    """Validate non-negative, strictly increasing within-period & across-period meter values."""
    if reading_start < 0 or reading_end < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Meter readings cannot be negative",
        )
    if reading_end <= reading_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "reading_end must be greater than reading_start "
                "(cumulative meter readings cannot decrease)"
            ),
        )

    existing_readings = list(
        db.scalars(
            select(RoomReading)
            .join(BillingPeriod, RoomReading.billing_period_id == BillingPeriod.id)
            .where(RoomReading.room_id == room_id)
            .order_by(BillingPeriod.period_start)
        ).all()
    )

    for r in existing_readings:
        if exclude_reading_id is not None and r.id == exclude_reading_id:
            continue
        if r.billing_period.period_end <= bp.period_start and reading_start < r.reading_end:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Cumulative reading cannot decrease: reading_start ({reading_start}) "
                    f"is lower than previous period end reading ({r.reading_end}) for '{r.billing_period.label}'"
                ),
            )
        if r.billing_period.period_start >= bp.period_end and reading_end > r.reading_start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Cumulative reading cannot decrease: reading_end ({reading_end}) "
                    f"exceeds subsequent period start reading ({r.reading_start}) for '{r.billing_period.label}'"
                ),
            )


@router.get(
    "/rooms/{room_id}/readings",
    response_model=list[RoomReadingOut],
    summary="List electricity readings for a room",
)
def list_room_readings(
    room_id: int,
    db: Session = Depends(get_db),
) -> list[RoomReading]:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )

    stmt = (
        select(RoomReading)
        .options(selectinload(RoomReading.billing_period))
        .join(BillingPeriod, RoomReading.billing_period_id == BillingPeriod.id)
        .where(RoomReading.room_id == room_id)
        .order_by(BillingPeriod.period_start.desc())
    )
    return list(db.scalars(stmt).all())


@router.post(
    "/rooms/{room_id}/readings",
    response_model=RoomReadingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a room reading",
)
def add_room_reading(
    room_id: int,
    payload: RoomReadingCreate,
    db: Session = Depends(get_db),
) -> RoomReading:
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
        select(RoomReading).where(
            RoomReading.room_id == room_id,
            RoomReading.billing_period_id == payload.billing_period_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Reading for room {room.room_number} during period '{bp.label}' already exists",
        )

    _validate_room_continuity(db, room_id, bp, payload.reading_start, payload.reading_end)

    consumption = round(payload.reading_end - payload.reading_start, 4)

    reading = RoomReading(
        room_id=room_id,
        billing_period_id=payload.billing_period_id,
        reading_start=payload.reading_start,
        reading_end=payload.reading_end,
        consumption=consumption,
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
    "/readings/{reading_id}",
    response_model=RoomReadingOut,
    summary="Update a room reading",
)
def update_room_reading(
    reading_id: int,
    payload: RoomReadingUpdate,
    db: Session = Depends(get_db),
) -> RoomReading:
    reading = db.scalar(
        select(RoomReading)
        .options(selectinload(RoomReading.billing_period))
        .where(RoomReading.id == reading_id)
    )
    if not reading:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room reading with id {reading_id} not found",
        )

    next_start = payload.reading_start if payload.reading_start is not None else reading.reading_start
    next_end = payload.reading_end if payload.reading_end is not None else reading.reading_end

    _validate_room_continuity(
        db, reading.room_id, reading.billing_period, next_start, next_end, exclude_reading_id=reading.id
    )

    reading.reading_start = next_start
    reading.reading_end = next_end
    reading.consumption = round(next_end - next_start, 4)
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
    "/readings/{reading_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a room reading",
)
def delete_room_reading(
    reading_id: int,
    db: Session = Depends(get_db),
) -> None:
    reading = db.get(RoomReading, reading_id)
    if not reading:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room reading with id {reading_id} not found",
        )
    room_id, period_id = reading.room_id, reading.billing_period_id
    db.delete(reading)
    db.flush()
    sync_period_verification_if_paired(db, room_id, period_id)
    db.commit()
