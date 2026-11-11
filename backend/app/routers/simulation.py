"""
Simulation router for BillShield API.

Generates clearly labelled simulated data for a room and billing period.
Non-negotiable rule: Every generated reading stores source="Simulated Demo Data".
Never presented as real sensor or manual data.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import BillingPeriod, HostelMeterReading, Room, RoomReading, Settings
from app.schemas import SimulationRequest, SimulationResponse
from app.services.bootstrap import sync_period_verification_if_paired
from app.services.simulate import SIMULATED_SOURCE, generate_simulated_readings

router = APIRouter(tags=["simulation"])


@router.post(
    "/rooms/{room_id}/simulate",
    response_model=SimulationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate clearly labelled simulated demo data for a room and billing period",
)
def simulate_readings(
    room_id: int,
    payload: SimulationRequest,
    db: Session = Depends(get_db),
) -> SimulationResponse:
    # 1. Load room with appliances
    stmt = (
        select(Room)
        .options(selectinload(Room.appliances))
        .where(Room.id == room_id)
    )
    room = db.scalar(stmt)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )

    # 2. Load billing period
    bp = db.get(BillingPeriod, payload.billing_period_id)
    if not bp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Billing period with id {payload.billing_period_id} not found",
        )

    # 3. Load settings
    settings = db.get(Settings, 1)
    if not settings:
        settings = Settings(id=1, rate_per_unit=10.0, tolerance_percent=5.0)

    # 4. Check previous room and hostel readings for cumulative continuity across periods
    prev_end = payload.previous_reading_end
    if prev_end is None:
        last_reading = db.scalar(
            select(RoomReading)
            .join(BillingPeriod, RoomReading.billing_period_id == BillingPeriod.id)
            .where(
                RoomReading.room_id == room_id,
                BillingPeriod.period_end <= bp.period_start,
            )
            .order_by(BillingPeriod.period_end.desc())
        )
        prev_end = last_reading.reading_end if last_reading else 1000.0

    last_hostel = db.scalar(
        select(HostelMeterReading)
        .join(BillingPeriod, HostelMeterReading.billing_period_id == BillingPeriod.id)
        .where(
            HostelMeterReading.room_id == room_id,
            BillingPeriod.period_end <= bp.period_start,
        )
        .order_by(BillingPeriod.period_end.desc())
    )
    prev_hostel_end = (
        last_hostel.reading_end
        if last_hostel and last_hostel.reading_end is not None
        else 2400.0
    )

    # 5. Generate readings using simulation service
    room_data, hostel_data = generate_simulated_readings(
        room=room,
        billing_period=bp,
        settings=settings,
        room_variance_percent=payload.room_variance_percent or 5.0,
        hostel_variance_percent=payload.hostel_variance_percent or 3.0,
        previous_reading_end=prev_end,
        previous_hostel_end=prev_hostel_end,
    )

    # 6. Remove existing readings for this room & period if any (replace with simulated)
    existing_rr = db.scalar(
        select(RoomReading).where(
            RoomReading.room_id == room_id,
            RoomReading.billing_period_id == bp.id,
        )
    )
    if existing_rr:
        db.delete(existing_rr)

    existing_hr = db.scalar(
        select(HostelMeterReading).where(
            HostelMeterReading.room_id == room_id,
            HostelMeterReading.billing_period_id == bp.id,
        )
    )
    if existing_hr:
        db.delete(existing_hr)

    db.flush()

    # 7. Create new simulated readings
    new_rr = RoomReading(**room_data)
    new_hr = HostelMeterReading(**hostel_data)

    db.add(new_rr)
    db.add(new_hr)
    db.flush()
    sync_period_verification_if_paired(db, room_id, bp.id)
    db.commit()

    db.refresh(new_rr)
    db.refresh(new_hr)
    db.refresh(new_rr, ["billing_period"])
    db.refresh(new_hr, ["billing_period"])

    return SimulationResponse(
        message=f"Simulated demo data generated successfully for room {room.room_number} in '{bp.label}'.",
        room_reading=new_rr,
        hostel_meter_reading=new_hr,
    )

