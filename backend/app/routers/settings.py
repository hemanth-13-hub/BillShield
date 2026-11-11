"""
Settings router for BillShield API.
Provides editable electricity rate (default ₹10/unit) and tolerance (default ±5%).
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import Settings, VerificationResult
from app.schemas import SettingsOut, SettingsUpdate
from app.services.bootstrap import sync_period_verification_if_paired

IST = ZoneInfo("Asia/Kolkata")
router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsOut, summary="Get application settings")
def get_settings(db: Session = Depends(get_db)) -> Settings:
    settings = db.get(Settings, 1)
    if not settings:
        # Auto-create if missing
        settings = Settings(id=1, rate_per_unit=10.0, tolerance_percent=5.0)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.put("", response_model=SettingsOut, summary="Update electricity rate and/or tolerance")
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)) -> Settings:
    settings = db.get(Settings, 1)
    if not settings:
        settings = Settings(id=1, rate_per_unit=10.0, tolerance_percent=5.0)
        db.add(settings)

    if payload.rate_per_unit is not None:
        if payload.rate_per_unit <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Rate per unit must be greater than zero",
            )
        settings.rate_per_unit = payload.rate_per_unit

    if payload.tolerance_percent is not None:
        if payload.tolerance_percent <= 0 or payload.tolerance_percent > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Tolerance percent must be between 0 and 100",
            )
        settings.tolerance_percent = payload.tolerance_percent

    settings.updated_at = datetime.now(tz=IST)
    db.flush()

    for vr in list(db.scalars(select(VerificationResult)).all()):
        sync_period_verification_if_paired(db, vr.room_id, vr.billing_period_id)

    db.commit()
    db.refresh(settings)
    return settings

