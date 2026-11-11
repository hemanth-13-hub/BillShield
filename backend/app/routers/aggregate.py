"""
Aggregation & analytics router for BillShield API.
Returns consumption aggregated at hourly, daily, weekly, or monthly granularity,
plus AC vs Non-AC average consumption comparison.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import BillingPeriod, HostelMeterReading, Room, RoomReading
from app.schemas import (
    AggregateDataPoint,
    AggregateResponse,
    RoomTypeComparisonResponse,
)
from app.services.aggregate import compute_ac_vs_non_ac_comparison, compute_aggregate

router = APIRouter(tags=["aggregate"])


@router.get(
    "/rooms/{room_id}/aggregate",
    response_model=AggregateResponse,
    summary="Get aggregated consumption for a room (hourly, daily, weekly, or monthly)",
)
def get_room_aggregate(
    room_id: int,
    granularity: Literal["hourly", "daily", "weekly", "monthly"] = Query(
        "monthly", description="Aggregation granularity"
    ),
    db: Session = Depends(get_db),
) -> AggregateResponse:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )

    room_readings = list(
        db.scalars(
            select(RoomReading)
            .options(selectinload(RoomReading.billing_period))
            .where(RoomReading.room_id == room_id)
        ).all()
    )

    hostel_readings = list(
        db.scalars(
            select(HostelMeterReading)
            .options(selectinload(HostelMeterReading.billing_period))
            .where(HostelMeterReading.room_id == room_id)
        ).all()
    )

    raw_points = compute_aggregate(room_readings, hostel_readings, granularity)
    data_points = [AggregateDataPoint(**pt) for pt in raw_points]

    is_interpolated = granularity in ("hourly", "daily", "weekly")
    note = (
        f"Consumption data aggregated at {granularity} granularity. "
        + (
            "Values are estimated/interpolated from stored billing period totals — not raw sensor intervals."
            if is_interpolated
            else "Values are direct billing period totals."
        )
    )

    return AggregateResponse(
        room_id=room_id,
        granularity=granularity,
        data_points=data_points,
        is_interpolated=is_interpolated,
        note=note,
    )


@router.get(
    "/analytics/room-type-comparison",
    response_model=RoomTypeComparisonResponse,
    summary="Compare AC vs Non-AC average electricity consumption",
)
def get_room_type_comparison(db: Session = Depends(get_db)) -> RoomTypeComparisonResponse:
    rooms = list(db.scalars(select(Room)).all())
    readings = list(db.scalars(select(RoomReading)).all())
    periods = list(db.scalars(select(BillingPeriod)).all())

    result = compute_ac_vs_non_ac_comparison(rooms, readings, periods)
    return RoomTypeComparisonResponse(**result)
