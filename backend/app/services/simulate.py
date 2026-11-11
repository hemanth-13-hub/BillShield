"""
Simulation service for BillShield.

Generates realistic but clearly labelled "Simulated Demo Data" readings for a
room and billing period. Uses the room's appliance inventory to compute a
theoretical baseline, then applies controlled variance.

Non-negotiable rule: Every generated reading is tagged source="Simulated Demo Data".
Never presented as physical sensor measurements.
"""

from __future__ import annotations

import random
from typing import Optional

from app.models import Appliance, BillingPeriod, ReadingSource, Room, Settings, _now_ist

SIMULATED_SOURCE = ReadingSource.SIMULATED.value  # "Simulated Demo Data"


def compute_theoretical_kwh(appliances: list[Appliance], days: int) -> float:
    """
    Calculate theoretical electricity consumption from room appliances.
    Formula: (rated_watts * quantity * assumed_daily_hours) / 1000 * days
    """
    daily_kwh = sum(
        (a.rated_watts * a.quantity * a.assumed_daily_hours) / 1000.0
        for a in appliances
    )
    return round(daily_kwh * days, 4)


def generate_simulated_readings(
    room: Room,
    billing_period: BillingPeriod,
    settings: Settings,
    room_variance_percent: float = 5.0,
    hostel_variance_percent: float = 3.0,
    previous_reading_end: Optional[float] = None,
    previous_hostel_end: Optional[float] = None,
) -> tuple[dict, dict]:
    """
    Generate simulated room reading and hostel meter reading dicts.
    Both dictionaries carry source = "Simulated Demo Data" and explicit start/end readings.
    """
    days = (billing_period.period_end - billing_period.period_start).days + 1
    theoretical_kwh = compute_theoretical_kwh(room.appliances, days)

    if theoretical_kwh <= 0:
        theoretical_kwh = 120.0 if room.room_type == "ac" else 45.0

    # Apply random variance to room consumption
    room_var_factor = random.uniform(
        -abs(room_variance_percent) / 100.0,
        abs(room_variance_percent) / 100.0,
    )
    room_consumption = round(max(1.0, theoretical_kwh * (1.0 + room_var_factor)), 2)

    # Apply variance to hostel billed units
    hostel_var_factor = random.uniform(
        -abs(hostel_variance_percent) / 100.0,
        abs(hostel_variance_percent) / 100.0,
    )
    hostel_units = round(max(1.0, room_consumption * (1.0 + hostel_var_factor)), 2)

    reading_start = round(previous_reading_end if previous_reading_end is not None else 1000.0, 2)
    reading_end = round(reading_start + room_consumption, 2)

    hostel_start = round(previous_hostel_end if previous_hostel_end is not None else 2400.0, 2)
    hostel_end = round(hostel_start + hostel_units, 2)

    now_ts = _now_ist()

    room_reading_data = {
        "room_id": room.id,
        "billing_period_id": billing_period.id,
        "reading_start": reading_start,
        "reading_end": reading_end,
        "consumption": room_consumption,
        "source": SIMULATED_SOURCE,
        "recorded_at": now_ts,
        "notes": (
            f"[SIMULATED DATA] Baseline: {theoretical_kwh:.2f} kWh, "
            f"Variance: {room_var_factor * 100:+.1f}%"
        ),
    }

    hostel_reading_data = {
        "room_id": room.id,
        "billing_period_id": billing_period.id,
        "reading_start": hostel_start,
        "reading_end": hostel_end,
        "billed_units": hostel_units,
        "billed_amount": round(hostel_units * settings.rate_per_unit, 2),
        "source": SIMULATED_SOURCE,
        "recorded_at": now_ts,
        "notes": (
            f"[SIMULATED DATA] Hostel meter variance: {hostel_var_factor * 100:+.1f}%"
        ),
    }

    return room_reading_data, hostel_reading_data
