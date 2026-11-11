"""
Standard Aditya University hostel room appliance profiles.

Provides a single source of truth used when creating or updating a room
so every AC or Non-AC room receives its matching theoretical appliance list.
"""

from __future__ import annotations

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import Appliance, RoomType

# Tuple format: (name, rated_watts, quantity, assumed_daily_hours)
AC_ROOM_APPLIANCES: list[tuple[str, float, int, float]] = [
    ("Air Conditioner", 1500.0, 1, 8.0),
    ("Normal Fan",        75.0, 2, 12.0),
    ("Tube Light",        40.0, 2, 8.0),
    ("Washroom Light",    15.0, 1, 2.0),
    ("Balcony Light",     15.0, 1, 3.0),
]

NON_AC_ROOM_APPLIANCES: list[tuple[str, float, int, float]] = [
    ("Normal Fan",        75.0, 2, 14.0),
    ("Tube Light",        40.0, 2, 8.0),
    ("Washroom Light",    15.0, 1, 2.0),
    ("Balcony Light",     15.0, 1, 3.0),
]


def set_room_appliances(db: Session, room_id: int, room_type: str) -> None:
    """
    Replace a room's appliance inventory with the standard profile for `room_type`.
    Flushes without committing so callers control the surrounding transaction.
    """
    db.execute(delete(Appliance).where(Appliance.room_id == room_id))

    specs = AC_ROOM_APPLIANCES if room_type == RoomType.AC.value else NON_AC_ROOM_APPLIANCES
    for name, watts, qty, hours in specs:
        db.add(
            Appliance(
                room_id=room_id,
                name=name,
                rated_watts=watts,
                quantity=qty,
                assumed_daily_hours=hours,
            )
        )
    db.flush()

