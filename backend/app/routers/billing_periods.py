"""
Billing periods router for BillShield API.
Enforces: period_end > period_start, no overlapping billing periods.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import BillingPeriod
from app.schemas import BillingPeriodCreate, BillingPeriodOut

router = APIRouter(prefix="/billing-periods", tags=["billing-periods"])


@router.get("", response_model=list[BillingPeriodOut], summary="List billing periods")
def list_billing_periods(db: Session = Depends(get_db)) -> list[BillingPeriod]:
    stmt = select(BillingPeriod).order_by(BillingPeriod.period_start)
    return list(db.scalars(stmt).all())


@router.get("/{period_id}", response_model=BillingPeriodOut, summary="Get billing period by id")
def get_billing_period(period_id: int, db: Session = Depends(get_db)) -> BillingPeriod:
    bp = db.get(BillingPeriod, period_id)
    if not bp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Billing period with id {period_id} not found",
        )
    return bp


@router.post("", response_model=BillingPeriodOut, status_code=status.HTTP_201_CREATED, summary="Create a billing period")
def create_billing_period(payload: BillingPeriodCreate, db: Session = Depends(get_db)) -> BillingPeriod:
    # 1. Date order check (already in Pydantic schema validator, but double checked)
    if payload.period_end <= payload.period_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="period_end must be strictly after period_start",
        )

    # 2. Check for overlapping date ranges
    # Overlap occurs if new_start <= existing_end AND new_end >= existing_start
    overlap = db.scalar(
        select(BillingPeriod).where(
            BillingPeriod.period_start <= payload.period_end,
            BillingPeriod.period_end >= payload.period_start,
        )
    )
    if overlap:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Billing period overlaps with existing period '{overlap.label}' "
                f"({overlap.period_start} to {overlap.period_end})"
            ),
        )

    bp = BillingPeriod(
        period_start=payload.period_start,
        period_end=payload.period_end,
        label=payload.label,
    )
    db.add(bp)
    db.commit()
    db.refresh(bp)
    return bp

