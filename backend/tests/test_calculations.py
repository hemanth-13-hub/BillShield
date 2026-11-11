"""
Unit tests for critical BillShield electricity & verification calculations.
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.models import Appliance
from app.services.appliances import AC_ROOM_APPLIANCES, NON_AC_ROOM_APPLIANCES
from app.services.compare import (
    VERDICT_MATCH,
    VERDICT_MINOR,
    VERDICT_MISMATCH,
    compute_comparison,
    compute_verdict,
)
from app.services.simulate import compute_theoretical_kwh

IST = ZoneInfo("Asia/Kolkata")


def test_theoretical_kwh_ac_and_non_ac_profiles() -> None:
    ac_apps = [
        Appliance(
            room_id=1,
            name=name,
            rated_watts=watts,
            quantity=qty,
            assumed_daily_hours=hours,
        )
        for name, watts, qty, hours in AC_ROOM_APPLIANCES
    ]
    non_ac_apps = [
        Appliance(
            room_id=2,
            name=name,
            rated_watts=watts,
            quantity=qty,
            assumed_daily_hours=hours,
        )
        for name, watts, qty, hours in NON_AC_ROOM_APPLIANCES
    ]

    # AC: (1500*1*8 + 75*2*12 + 40*2*8 + 15*1*2 + 15*1*3) / 1000 = 14.515 kWh/day -> 435.45 in 30d
    assert compute_theoretical_kwh(ac_apps, 30) == 435.45

    # Non-AC: (75*2*14 + 40*2*8 + 15*1*2 + 15*1*3) / 1000 = 2.815 kWh/day -> 84.45 in 30d
    assert compute_theoretical_kwh(non_ac_apps, 30) == 84.45


def test_verdict_boundary_thresholds() -> None:
    tol = 5.0
    assert compute_verdict(0.0, tol) == VERDICT_MATCH
    assert compute_verdict(5.0, tol) == VERDICT_MATCH
    assert compute_verdict(-5.0, tol) == VERDICT_MATCH
    assert compute_verdict(5.01, tol) == VERDICT_MINOR
    assert compute_verdict(10.0, tol) == VERDICT_MINOR
    assert compute_verdict(-10.0, tol) == VERDICT_MINOR
    assert compute_verdict(10.01, tol) == VERDICT_MISMATCH
    assert compute_verdict(-12.5, tol) == VERDICT_MISMATCH


def test_compute_comparison_accuracy_and_zero_hostel_guard() -> None:
    settings = SimpleNamespace(rate_per_unit=10.0, tolerance_percent=5.0)
    rr = SimpleNamespace(
        consumption=260.0,
        source="Manual Entry",
        recorded_at=datetime.now(tz=IST),
    )
    hr = SimpleNamespace(
        billed_units=290.0,
        billed_amount=2900.0,
        source="Manual Entry",
        recorded_at=datetime.now(tz=IST),
    )

    comp = compute_comparison(rr, hr, settings)
    assert comp["room_units"] == 260.0
    assert comp["hostel_units"] == 290.0
    assert comp["difference_units"] == -30.0
    assert comp["difference_percent"] == -10.34
    assert comp["room_bill"] == 2600.0
    assert comp["hostel_bill"] == 2900.0
    assert comp["verdict"] == VERDICT_MISMATCH

    # Guard against division by zero when hostel_units == 0
    hr_zero = SimpleNamespace(
        billed_units=0.0,
        billed_amount=0.0,
        source="Manual Entry",
        recorded_at=datetime.now(tz=IST),
    )
    comp_zero = compute_comparison(rr, hr_zero, settings)
    assert comp_zero["difference_percent"] == 100.0

