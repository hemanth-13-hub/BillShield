"""
Database initialization, reference-catalog synchronization, and verification
persistence helpers for BillShield.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import config
from app.models import (
    BillingPeriod,
    Block,
    HostelBlock,
    HostelCategory,
    HostelMeterReading,
    HostelType,
    RoomReading,
    Roommate,
    Settings,
    Student,
    VerificationResult,
    _now_ist,
)
from app.services.compare import compute_comparison

HOSTEL_CATALOG: tuple[tuple[str, str, str], ...] = (
    (
        HostelType.BOYS.value,
        "Boys Hostel",
        "Aditya University Boys Hostel covering Blocks A through G (AC & Non-AC rooms).",
    ),
    (
        HostelType.GIRLS.value,
        "Girls Hostel",
        "Aditya University Girls Hostel covering Blocks A through G (AC & Non-AC rooms).",
    ),
)

DEFAULT_BILLING_PERIODS: tuple[tuple[date, date, str], ...] = (
    (date(2026, 9, 1), date(2026, 9, 30), "September 2026"),
    (date(2026, 10, 1), date(2026, 10, 31), "October 2026"),
    (date(2026, 11, 1), date(2026, 11, 30), "November 2026"),
)


def ensure_reference_data(db: Session) -> None:
    """
    Idempotently populate hostel categories, blocks (A-G for Boys & Girls),
    default Settings (id=1), and initial billing periods if absent.
    Never invents university students or room records.
    """
    categories_by_code: dict[str, HostelCategory] = {}
    for code, name, desc in HOSTEL_CATALOG:
        cat = db.scalar(select(HostelCategory).where(HostelCategory.code == code))
        if not cat:
            cat = HostelCategory(code=code, name=name, description=desc)
            db.add(cat)
            db.flush()
        categories_by_code[code] = cat

    for code, cat in categories_by_code.items():
        for blk in Block:
            existing_blk = db.scalar(
                select(HostelBlock).where(
                    HostelBlock.hostel_category_id == cat.id,
                    HostelBlock.code == blk.value,
                )
            )
            if not existing_blk:
                db.add(
                    HostelBlock(
                        hostel_category_id=cat.id,
                        code=blk.value,
                        name=f"Block {blk.value}",
                    )
                )

    settings = db.get(Settings, 1)
    if not settings:
        db.add(
            Settings(
                id=1,
                rate_per_unit=config.default_rate_per_unit,
                tolerance_percent=config.default_tolerance_percent,
            )
        )

    existing_period = db.scalar(select(BillingPeriod.id).limit(1))
    if existing_period is None:
        for p_start, p_end, label in DEFAULT_BILLING_PERIODS:
            db.add(BillingPeriod(period_start=p_start, period_end=p_end, label=label))

    db.commit()


def resolve_block_id(db: Session, hostel_type: str, block_code: str) -> Optional[int]:
    """Return HostelBlock.id for (hostel_type, block_code), creating reference rows if needed."""
    cat = db.scalar(select(HostelCategory).where(HostelCategory.code == hostel_type))
    if not cat:
        ensure_reference_data(db)
        cat = db.scalar(select(HostelCategory).where(HostelCategory.code == hostel_type))
    if not cat:
        return None
    blk = db.scalar(
        select(HostelBlock).where(
            HostelBlock.hostel_category_id == cat.id,
            HostelBlock.code == block_code,
        )
    )
    return blk.id if blk else None


def sync_student_roommate(db: Session, student: Student) -> Optional[Roommate]:
    """
    Maintain the Roommate slot record (1..3) synchronized with Student.room_id.
    Flushes without committing so callers own the transaction boundary.
    """
    existing = db.scalar(select(Roommate).where(Roommate.student_id == student.id))
    if existing and existing.room_id == student.room_id:
        return existing
    if existing and existing.room_id != student.room_id:
        db.delete(existing)
        db.flush()

    used_slots = set(
        db.scalars(
            select(Roommate.slot_number).where(Roommate.room_id == student.room_id)
        ).all()
    )
    open_slot = next((slot for slot in (1, 2, 3) if slot not in used_slots), None)
    if open_slot is None:
        return None

    rm = Roommate(room_id=student.room_id, student_id=student.id, slot_number=open_slot)
    db.add(rm)
    db.flush()
    return rm


def upsert_verification_result(
    db: Session,
    room_id: int,
    billing_period_id: int,
    room_reading: RoomReading,
    hostel_reading: HostelMeterReading,
    comparison_data: dict,
) -> VerificationResult:
    """Insert or update the stored VerificationResult row for (room_id, billing_period_id)."""
    existing = db.scalar(
        select(VerificationResult).where(
            VerificationResult.room_id == room_id,
            VerificationResult.billing_period_id == billing_period_id,
        )
    )
    bill_diff = round(comparison_data["room_bill"] - comparison_data["hostel_bill"], 2)
    now_ts = _now_ist()

    if existing:
        existing.room_reading_id = room_reading.id
        existing.hostel_meter_reading_id = hostel_reading.id
        existing.room_units = comparison_data["room_units"]
        existing.hostel_units = comparison_data["hostel_units"]
        existing.difference_units = comparison_data["difference_units"]
        existing.difference_percent = comparison_data["difference_percent"]
        existing.rate_per_unit = comparison_data["rate_per_unit"]
        existing.tolerance_percent = comparison_data["tolerance_percent"]
        existing.room_bill = comparison_data["room_bill"]
        existing.hostel_bill = comparison_data["hostel_bill"]
        existing.bill_difference_rupees = bill_diff
        existing.verdict = comparison_data["verdict"]
        existing.room_reading_source = comparison_data["room_reading_source"]
        existing.hostel_reading_source = comparison_data["hostel_reading_source"]
        existing.verified_at = now_ts
        db.flush()
        return existing

    vr = VerificationResult(
        room_id=room_id,
        billing_period_id=billing_period_id,
        room_reading_id=room_reading.id,
        hostel_meter_reading_id=hostel_reading.id,
        room_units=comparison_data["room_units"],
        hostel_units=comparison_data["hostel_units"],
        difference_units=comparison_data["difference_units"],
        difference_percent=comparison_data["difference_percent"],
        rate_per_unit=comparison_data["rate_per_unit"],
        tolerance_percent=comparison_data["tolerance_percent"],
        room_bill=comparison_data["room_bill"],
        hostel_bill=comparison_data["hostel_bill"],
        bill_difference_rupees=bill_diff,
        verdict=comparison_data["verdict"],
        room_reading_source=comparison_data["room_reading_source"],
        hostel_reading_source=comparison_data["hostel_reading_source"],
        verified_at=now_ts,
    )
    db.add(vr)
    db.flush()
    return vr


def sync_period_verification_if_paired(
    db: Session,
    room_id: int,
    billing_period_id: int,
) -> Optional[VerificationResult]:
    """
    Recompute and persist VerificationResult when both RoomReading and HostelMeterReading
    exist for (room_id, billing_period_id); remove any stale VerificationResult otherwise.
    """
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
        db.execute(
            delete(VerificationResult).where(
                VerificationResult.room_id == room_id,
                VerificationResult.billing_period_id == billing_period_id,
            )
        )
        return None

    settings = db.get(Settings, 1) or Settings(id=1, rate_per_unit=10.0, tolerance_percent=5.0)
    res = compute_comparison(room_reading, hostel_reading, settings)
    return upsert_verification_result(
        db, room_id, billing_period_id, room_reading, hostel_reading, res
    )

