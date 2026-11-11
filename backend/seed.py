"""
BillShield database initialization & seed script.

Default usage:
  python seed.py
    Creates all 11 SQLite tables and seeds Aditya University reference catalogs:
      - Hostel categories : Boys Hostel, Girls Hostel
      - Blocks            : A through G for each hostel category (14 blocks)
      - Settings          : singleton row (Rs. 10.00/kWh, +/-5% tolerance)
      - BillingPeriods    : September, October, November 2026
    Does NOT invent real university room numbers or student personal records.

Optional demo dataset usage:
  python seed.py --demo
    Adds clearly labelled SIMULATED sample demo rooms and simulated readings for
    testing charts, comparisons, history, and PDF watermarks.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, ".")

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import (
    BillingPeriod,
    HostelMeterReading,
    Room,
    RoomReading,
    Settings,
    Student,
)
from app.services.appliances import set_room_appliances
from app.services.bootstrap import (
    ensure_reference_data,
    resolve_block_id,
    sync_period_verification_if_paired,
    sync_student_roommate,
)
from app.services.simulate import generate_simulated_readings

IST = ZoneInfo("Asia/Kolkata")


def seed_demo_data() -> None:
    """Populate clearly fictional SIMULATED DEMO rooms, roommates, and readings."""
    db = SessionLocal()
    try:
        ensure_reference_data(db)
        settings = db.get(Settings, 1) or Settings(id=1, rate_per_unit=10.0, tolerance_percent=5.0)
        periods = list(
            db.scalars(select(BillingPeriod).order_by(BillingPeriod.period_start.asc())).all()
        )

        demo_specs = [
            (
                "boys",
                "A",
                "DEMO-101",
                "ac",
                1,
                [
                    ("Demo Student A1", "DEMO01A1"),
                    ("Demo Student A2", "DEMO01A2"),
                    ("Demo Student A3", "DEMO01A3"),
                ],
            ),
            (
                "girls",
                "B",
                "DEMO-202",
                "non_ac",
                2,
                [
                    ("Demo Student B1", "DEMO02B1"),
                    ("Demo Student B2", "DEMO02B2"),
                    ("Demo Student B3", "DEMO02B3"),
                ],
            ),
        ]

        for hostel_type, block_code, room_num, room_type, floor, mates in demo_specs:
            existing = db.scalar(
                select(Room).where(
                    Room.hostel_type == hostel_type,
                    Room.block == block_code,
                    Room.room_number == room_num,
                )
            )
            if existing:
                continue

            room = Room(
                block_id=resolve_block_id(db, hostel_type, block_code),
                hostel_type=hostel_type,
                block=block_code,
                room_number=room_num,
                room_type=room_type,
                floor=floor,
            )
            db.add(room)
            db.flush()
            set_room_appliances(db, room.id, room_type)

            for s_name, s_roll in mates:
                st = Student(room_id=room.id, name=s_name, roll_number=s_roll)
                db.add(st)
                db.flush()
                sync_student_roommate(db, st)

            prev_room_end = 1000.0
            prev_hostel_end = 2400.0
            for bp in periods:
                r_data, h_data = generate_simulated_readings(
                    room=room,
                    billing_period=bp,
                    settings=settings,
                    room_variance_percent=5.0,
                    hostel_variance_percent=7.0 if room_type == "ac" else 2.5,
                    previous_reading_end=prev_room_end,
                    previous_hostel_end=prev_hostel_end,
                )
                prev_room_end = r_data["reading_end"]
                prev_hostel_end = h_data["reading_end"]
                db.add(RoomReading(**r_data))
                db.add(HostelMeterReading(**h_data))
                db.flush()
                sync_period_verification_if_paired(db, room.id, bp.id)

        db.commit()
        print("SIMULATED DEMO rooms, roommates, and 3-month readings seeded.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def seed(with_demo: bool = False) -> None:
    print("=" * 60)
    print("  BillShield Database Seed Script")
    print(f"  {datetime.now(tz=IST).strftime('%Y-%m-%d %H:%M:%S IST')}")
    print("=" * 60)

    print("\nResetting tables ...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("Schema initialized (11 SQLite tables).\n")

    db = SessionLocal()
    try:
        ensure_reference_data(db)
        print("Hostel categories : Boys Hostel, Girls Hostel")
        print("Blocks            : A-G for each hostel (14 blocks)")
        print("Settings          : Rs. 10.00 / kWh | tolerance +/-5.0%")
        print("Billing periods   : Sep, Oct, Nov 2026")
    except Exception:
        db.rollback()
        print("\nSeed failed - transaction rolled back.")
        raise
    finally:
        db.close()

    if with_demo:
        seed_demo_data()
    else:
        print("Rooms & students  : empty (register dynamically or pass --demo)\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize BillShield SQLite database.")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Also insert clearly labelled SIMULATED DEMO rooms and readings.",
    )
    args = parser.parse_args()
    seed(with_demo=args.demo)
