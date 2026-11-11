"""
Compare router for BillShield API.

Enforces:
  - "Readings only comparable within the same billing period"
  - Compares room reading vs hostel meter reading for the exact same billing period
  - Returns units, difference, difference %, bill amounts, and verdict:
    "Readings Match" | "Minor Variation" | "Significant Mismatch"
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import (
    BillingPeriod,
    HostelMeterReading,
    Room,
    RoomReading,
    Settings,
    VerificationResult,
)
from app.schemas import CompareResponse, VerificationResultOut
from app.services.bootstrap import upsert_verification_result
from app.services.compare import compute_comparison

router = APIRouter(tags=["compare"])


@router.get(
    "/rooms/{room_id}/compare",
    response_model=CompareResponse,
    summary="Compare room reading against hostel meter reading for a billing period",
)
def compare_readings(
    room_id: int,
    billing_period_id: int = Query(..., description="Billing period ID to compare"),
    db: Session = Depends(get_db),
) -> CompareResponse:
    # 1. Verify room exists
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )

    # 2. Verify billing period exists
    bp = db.get(BillingPeriod, billing_period_id)
    if not bp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Billing period with id {billing_period_id} not found",
        )

    # 3. Retrieve room reading for this exact billing period
    room_reading = db.scalar(
        select(RoomReading).where(
            RoomReading.room_id == room_id,
            RoomReading.billing_period_id == billing_period_id,
        )
    )

    # 4. Retrieve hostel reading for this exact billing period
    hostel_reading = db.scalar(
        select(HostelMeterReading).where(
            HostelMeterReading.room_id == room_id,
            HostelMeterReading.billing_period_id == billing_period_id,
        )
    )

    # 5. Non-negotiable rule: Readings only comparable within the same billing period
    if not room_reading or not hostel_reading:
        missing = []
        if not room_reading:
            missing.append("room reading")
        if not hostel_reading:
            missing.append("hostel meter reading")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Readings are only comparable within the same billing period. "
                f"Missing {', '.join(missing)} for room {room.room_number} in period '{bp.label}'."
            ),
        )

    # 6. Retrieve settings
    settings = db.get(Settings, 1)
    if not settings:
        settings = Settings(id=1, rate_per_unit=10.0, tolerance_percent=5.0)

    # 7. Compute comparison and persist VerificationResult snapshot
    res = compute_comparison(room_reading, hostel_reading, settings)
    upsert_verification_result(
        db, room_id, billing_period_id, room_reading, hostel_reading, res
    )
    db.commit()

    return CompareResponse(
        room_id=room_id,
        billing_period_id=billing_period_id,
        billing_period_label=bp.label,
        period_start=bp.period_start,
        period_end=bp.period_end,
        room_reading_start=room_reading.reading_start,
        room_reading_end=room_reading.reading_end,
        room_recorded_at=room_reading.recorded_at,
        hostel_reading_start=hostel_reading.reading_start,
        hostel_reading_end=hostel_reading.reading_end,
        hostel_recorded_at=hostel_reading.recorded_at,
        room_units=res["room_units"],
        hostel_units=res["hostel_units"],
        difference_units=res["difference_units"],
        difference_percent=res["difference_percent"],
        room_bill=res["room_bill"],
        hostel_bill=res["hostel_bill"],
        rate_per_unit=res["rate_per_unit"],
        tolerance_percent=res["tolerance_percent"],
        verdict=res["verdict"],
        room_reading_source=res["room_reading_source"],
        hostel_reading_source=res["hostel_reading_source"],
    )


@router.get(
    "/rooms/{room_id}/verifications",
    response_model=list[VerificationResultOut],
    summary="List persisted verification results for a room",
)
def list_room_verifications(
    room_id: int,
    db: Session = Depends(get_db),
) -> list[VerificationResult]:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )
    stmt = (
        select(VerificationResult)
        .options(selectinload(VerificationResult.billing_period))
        .join(BillingPeriod, VerificationResult.billing_period_id == BillingPeriod.id)
        .where(VerificationResult.room_id == room_id)
        .order_by(BillingPeriod.period_start.desc())
    )
    return list(db.scalars(stmt).all())

