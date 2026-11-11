"""
PDF report router for BillShield API.
Generates downloadable official verification audit certificates backed by
exact `compute_comparison` calculations and ReportLab vector charts.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import (
    BillingPeriod,
    HostelMeterReading,
    Room,
    RoomReading,
    Settings,
    Student,
)
from app.services.pdf_report import generate_verification_pdf

router = APIRouter(tags=["report"])


@router.get(
    "/rooms/{room_id}/report/pdf",
    summary="Download PDF electricity verification report for a room and billing period",
    responses={200: {"content": {"application/pdf": {}}}},
)
def download_pdf_report(
    room_id: int,
    billing_period_id: int = Query(..., description="Billing period ID"),
    student_id: Optional[int] = Query(None, description="Optional student ID to feature on report"),
    inline: bool = Query(False, description="Render inline instead of attachment download"),
    db: Session = Depends(get_db),
) -> Response:
    room = db.scalar(
        select(Room)
        .options(selectinload(Room.students), selectinload(Room.appliances))
        .where(Room.id == room_id)
    )
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )

    bp = db.get(BillingPeriod, billing_period_id)
    if not bp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Billing period with id {billing_period_id} not found",
        )

    room_reading = db.scalar(
        select(RoomReading).where(
            RoomReading.room_id == room_id,
            RoomReading.billing_period_id == billing_period_id,
        )
    )
    hostel_reading = db.scalar(
        select(HostelMeterReading).where(
            HostelMeterReading.room_id == room_id,
            HostelMeterReading.billing_period_id == billing_period_id,
        )
    )

    if not room_reading or not hostel_reading:
        missing = []
        if not room_reading:
            missing.append("room sensor reading")
        if not hostel_reading:
            missing.append("hostel meter reading")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot generate PDF report: missing {' and '.join(missing)} "
                f"for Room {room.room_number} in '{bp.label}'."
            ),
        )

    settings = db.get(Settings, 1)
    if not settings:
        settings = Settings(id=1, rate_per_unit=10.0, tolerance_percent=5.0)

    featured_student: Optional[Student] = None
    if student_id is not None:
        featured_student = db.get(Student, student_id)

    # Gather paired readings across periods for the comparison chart inside the PDF
    all_room = list(
        db.scalars(
            select(RoomReading)
            .options(selectinload(RoomReading.billing_period))
            .join(BillingPeriod, RoomReading.billing_period_id == BillingPeriod.id)
            .where(RoomReading.room_id == room_id)
            .order_by(BillingPeriod.period_start.asc())
        ).all()
    )
    all_hostel = {
        hr.billing_period_id: hr
        for hr in db.scalars(
            select(HostelMeterReading).where(HostelMeterReading.room_id == room_id)
        ).all()
    }
    historical_pairs = [
        (rr.billing_period.label, rr.consumption, all_hostel[rr.billing_period_id].billed_units)
        for rr in all_room
        if rr.billing_period_id in all_hostel
    ]

    pdf_bytes = generate_verification_pdf(
        room=room,
        billing_period=bp,
        room_reading=room_reading,
        hostel_reading=hostel_reading,
        settings=settings,
        student=featured_student,
        historical_pairs=historical_pairs,
    )

    safe_period = bp.label.replace(" ", "-")
    filename = f"BillShield-Verification-Room-{room.room_number}-{safe_period}.pdf"
    disposition = "inline" if inline else "attachment"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )

