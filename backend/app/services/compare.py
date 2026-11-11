"""
Bill comparison service for BillShield.

Verdict thresholds (applied to |difference_percent|):
  <= tolerance                  ->  "Readings Match"
  tolerance < diff <= 2*tol    ->  "Minor Variation"
  > 2*tolerance                ->  "Significant Mismatch"
"""

from __future__ import annotations

from app.models import HostelMeterReading, RoomReading, Settings

VERDICT_MATCH = "Readings Match"
VERDICT_MINOR = "Minor Variation"
VERDICT_MISMATCH = "Significant Mismatch"


def compute_verdict(diff_percent: float, tolerance: float) -> str:
    """
    Map an absolute percentage difference to a verdict string.
    """
    abs_diff = abs(diff_percent)
    if abs_diff <= tolerance:
        return VERDICT_MATCH
    elif abs_diff <= tolerance * 2:
        return VERDICT_MINOR
    else:
        return VERDICT_MISMATCH


def compute_comparison(
    room_reading: RoomReading,
    hostel_reading: HostelMeterReading,
    settings: Settings,
) -> dict:
    """
    Compute full comparison between a room reading and a hostel meter reading
    that share the same billing period.
    """
    room_units = room_reading.consumption
    hostel_units = hostel_reading.billed_units

    diff_units = room_units - hostel_units

    if hostel_units != 0:
        diff_percent = (diff_units / hostel_units) * 100.0
    else:
        diff_percent = 0.0 if room_units == 0 else 100.0

    room_bill = room_units * settings.rate_per_unit
    hostel_bill = hostel_reading.billed_amount

    verdict = compute_verdict(diff_percent, settings.tolerance_percent)

    return {
        "room_units": round(room_units, 4),
        "hostel_units": round(hostel_units, 4),
        "difference_units": round(diff_units, 4),
        "difference_percent": round(diff_percent, 2),
        "room_bill": round(room_bill, 2),
        "hostel_bill": round(hostel_bill, 2),
        "rate_per_unit": settings.rate_per_unit,
        "tolerance_percent": settings.tolerance_percent,
        "verdict": verdict,
        "room_reading_source": room_reading.source,
        "hostel_reading_source": hostel_reading.source,
    }

