"""
Pydantic v2 request / response schemas for BillShield API.

Naming convention
─────────────────
  <Model>Base    shared fields (no id / timestamps)
  <Model>Create  fields accepted on POST  (inherits Base, adds write-only fields)
  <Model>Update  fields accepted on PUT   (all Optional)
  <Model>Out     API response payload     (includes id + timestamps)
  <Model>Detail  response with nested relationships (used in detail / GET-by-id)

All response models set model_config = ConfigDict(from_attributes=True) so they
can be constructed directly from SQLAlchemy ORM objects.
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import Block, HostelType, ReadingSource, RoomType


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Shared ORM-compatible base
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class _ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Room
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class RoomBase(_ORMBase):
    hostel_type: HostelType
    block:       Block
    room_number: str       = Field(..., min_length=1, max_length=10)
    room_type:   RoomType
    floor:       int       = Field(..., ge=0, le=20)


class RoomCreate(RoomBase):
    """Fields required to create a new room."""
    pass


class RoomUpdate(_ORMBase):
    """All fields optional for PATCH-style updates."""
    hostel_type: Optional[HostelType] = None
    block:       Optional[Block]      = None
    room_number: Optional[str]        = Field(None, min_length=1, max_length=10)
    room_type:   Optional[RoomType]   = None
    floor:       Optional[int]        = Field(None, ge=0, le=20)


class RoomOut(RoomBase):
    """Room API response (list view — no nested children)."""
    id:         int
    created_at: datetime


class RoomDetail(RoomOut):
    """Room API response (detail view — includes students and appliances)."""
    students:   list[StudentOut]   = []
    appliances: list[ApplianceOut] = []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Student
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class StudentBase(_ORMBase):
    name:        str = Field(..., min_length=1, max_length=100)
    roll_number: str = Field(..., min_length=1, max_length=20)


class StudentCreate(StudentBase):
    room_id: int = Field(..., gt=0)


class StudentUpdate(_ORMBase):
    name:        Optional[str] = Field(None, min_length=1, max_length=100)
    roll_number: Optional[str] = Field(None, min_length=1, max_length=20)
    room_id:     Optional[int] = Field(None, gt=0)


class StudentOut(StudentBase):
    id:         int
    room_id:    int
    created_at: datetime


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Appliance
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ApplianceBase(_ORMBase):
    name:                str   = Field(..., min_length=1, max_length=80)
    rated_watts:         float = Field(..., gt=0,  description="Power rating in Watts")
    quantity:            int   = Field(..., ge=1, le=20)
    assumed_daily_hours: float = Field(..., gt=0, le=24, description="Assumed hours of use per day")


class ApplianceCreate(ApplianceBase):
    room_id: int = Field(..., gt=0)


class ApplianceUpdate(_ORMBase):
    name:                Optional[str]   = Field(None, min_length=1, max_length=80)
    rated_watts:         Optional[float] = Field(None, gt=0)
    quantity:            Optional[int]   = Field(None, ge=1, le=20)
    assumed_daily_hours: Optional[float] = Field(None, gt=0, le=24)


class ApplianceOut(ApplianceBase):
    id:      int
    room_id: int

    @property
    def daily_kwh_estimate(self) -> float:
        """
        Theoretical daily consumption estimate (kWh).
        Formula: (rated_watts × quantity × assumed_daily_hours) / 1000
        Labelled as *estimate* everywhere in the UI — not a measurement.
        """
        return round((self.rated_watts * self.quantity * self.assumed_daily_hours) / 1000, 4)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BillingPeriod
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class BillingPeriodBase(_ORMBase):
    period_start: date
    period_end:   date
    label:        str  = Field(..., min_length=1, max_length=50)

    @model_validator(mode="after")
    def _end_after_start(self) -> BillingPeriodBase:
        if self.period_end <= self.period_start:
            raise ValueError("period_end must be strictly after period_start")
        return self


class BillingPeriodCreate(BillingPeriodBase):
    pass


class BillingPeriodOut(BillingPeriodBase):
    id:         int
    created_at: datetime


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RoomReading
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class RoomReadingBase(_ORMBase):
    reading_start: float          = Field(..., ge=0,   description="kWh reading at period start")
    reading_end:   float          = Field(..., ge=0,   description="kWh reading at period end")
    source:        ReadingSource  = Field(...,          description="Must never be omitted")
    notes:         Optional[str]  = None

    @model_validator(mode="after")
    def _end_gt_start(self) -> RoomReadingBase:
        if self.reading_end <= self.reading_start:
            raise ValueError(
                "reading_end must be greater than reading_start "
                "(cumulative meter readings cannot decrease)"
            )
        return self


class RoomReadingCreate(RoomReadingBase):
    billing_period_id: int = Field(..., gt=0)
    recorded_at:       Optional[datetime] = None


class RoomReadingUpdate(_ORMBase):
    reading_start: Optional[float]    = Field(None, ge=0)
    reading_end:   Optional[float]    = Field(None, ge=0)
    recorded_at:   Optional[datetime] = None
    notes:         Optional[str]      = None


class RoomReadingOut(RoomReadingBase):
    id:                int
    room_id:           int
    billing_period_id: int
    consumption:       float          # = reading_end − reading_start, computed on insert
    recorded_at:       datetime
    created_at:        datetime
    billing_period:    BillingPeriodOut


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HostelMeterReading
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class HostelMeterReadingBase(_ORMBase):
    reading_start: Optional[float] = Field(None, ge=0, description="Hostel meter reading at period start")
    reading_end:   Optional[float] = Field(None, ge=0, description="Hostel meter reading at period end")
    billed_units:  Optional[float] = Field(None, ge=0, description="kWh charged on the hostel bill")
    billed_amount: Optional[float] = Field(None, ge=0, description="₹ amount on the hostel bill")
    source:        ReadingSource   = Field(..., description="Must never be omitted")
    notes:         Optional[str]   = None

    @model_validator(mode="after")
    def _validate_hostel_readings(self) -> HostelMeterReadingBase:
        if (self.reading_start is None) != (self.reading_end is None):
            raise ValueError("Both reading_start and reading_end must be provided together")
        if self.reading_start is not None and self.reading_end is not None:
            if self.reading_end <= self.reading_start:
                raise ValueError(
                    "reading_end must be greater than reading_start "
                    "(cumulative hostel meter readings cannot decrease)"
                )
        elif self.billed_units is None:
            raise ValueError("Provide either reading_start & reading_end or billed_units")
        return self


class HostelMeterReadingCreate(HostelMeterReadingBase):
    billing_period_id: int = Field(..., gt=0)
    recorded_at:       Optional[datetime] = None


class HostelMeterReadingUpdate(_ORMBase):
    reading_start: Optional[float]    = Field(None, ge=0)
    reading_end:   Optional[float]    = Field(None, ge=0)
    billed_units:  Optional[float]    = Field(None, ge=0)
    billed_amount: Optional[float]    = Field(None, ge=0)
    recorded_at:   Optional[datetime] = None
    notes:         Optional[str]      = None


class HostelMeterReadingOut(_ORMBase):
    id:                int
    room_id:           int
    billing_period_id: int
    reading_start:     Optional[float] = None
    reading_end:       Optional[float] = None
    billed_units:      float
    billed_amount:     float
    source:            ReadingSource
    notes:             Optional[str] = None
    recorded_at:       datetime
    created_at:        datetime
    billing_period:    BillingPeriodOut


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Settings
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class SettingsOut(_ORMBase):
    id:                int
    rate_per_unit:     float
    tolerance_percent: float
    updated_at:        datetime


class SettingsUpdate(_ORMBase):
    rate_per_unit:     Optional[float] = Field(None, gt=0,          description="₹ per kWh")
    tolerance_percent: Optional[float] = Field(None, gt=0, le=100,  description="% deviation threshold")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Health
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class HealthOut(BaseModel):
    status:    str
    app:       str
    version:   str
    db_tables: list[str]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Comparison
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class CompareResponse(BaseModel):
    room_id:              int
    billing_period_id:    int
    billing_period_label: str
    period_start:         date
    period_end:           date
    room_reading_start:   float
    room_reading_end:     float
    room_recorded_at:     datetime
    hostel_reading_start: Optional[float] = None
    hostel_reading_end:   Optional[float] = None
    hostel_recorded_at:   datetime
    room_units:           float
    hostel_units:         float
    difference_units:     float
    difference_percent:   float
    room_bill:            float
    hostel_bill:          float
    rate_per_unit:        float
    tolerance_percent:    float
    verdict:              str  # "Readings Match" | "Minor Variation" | "Significant Mismatch"
    room_reading_source:   str
    hostel_reading_source: str


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Aggregation & Analytics
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AggregateDataPoint(BaseModel):
    label:               str
    period_start:        str
    period_end:          str
    room_consumption:    float
    hostel_consumption:  Optional[float] = None
    difference_units:    Optional[float] = None
    room_source:         Optional[str] = None
    hostel_source:       Optional[str] = None


class AggregateResponse(BaseModel):
    room_id:         int
    granularity:     str  # "monthly" | "weekly" | "daily" | "hourly"
    data_points:     list[AggregateDataPoint]
    is_interpolated: bool
    note:            str


class RoomTypeAveragePoint(BaseModel):
    label:              str
    ac_avg_kwh:         Optional[float] = None
    non_ac_avg_kwh:     Optional[float] = None
    difference_kwh:     Optional[float] = None
    is_simulated_demo:  bool = False


class RoomTypeComparisonResponse(BaseModel):
    points:             list[RoomTypeAveragePoint]
    ac_overall_avg:     float
    non_ac_overall_avg: float
    is_simulated_demo:  bool
    note:               str


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Simulation
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class SimulationRequest(BaseModel):
    billing_period_id:        int = Field(..., gt=0)
    room_variance_percent:    Optional[float] = Field(5.0, ge=0.0, le=50.0)
    hostel_variance_percent:  Optional[float] = Field(3.0, ge=0.0, le=50.0)
    previous_reading_end:     Optional[float] = Field(None, ge=0.0)


class SimulationResponse(BaseModel):
    message:               str
    room_reading:          RoomReadingOut
    hostel_meter_reading:  HostelMeterReadingOut


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Hostel Categories, Blocks, Roommates & Verification Results
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class HostelBlockOut(_ORMBase):
    id:                 int
    hostel_category_id: int
    code:               str
    name:               str


class HostelCategoryOut(_ORMBase):
    id:          int
    code:        str
    name:        str
    description: Optional[str] = None
    blocks:      list[HostelBlockOut] = []


class RoommateOut(_ORMBase):
    id:          int
    room_id:     int
    student_id:  int
    slot_number: int
    assigned_at: datetime
    student:     Optional[StudentOut] = None


class VerificationResultOut(_ORMBase):
    id:                       int
    room_id:                  int
    billing_period_id:        int
    room_reading_id:          int
    hostel_meter_reading_id:  int
    room_units:               float
    hostel_units:             float
    difference_units:         float
    difference_percent:       float
    rate_per_unit:            float
    tolerance_percent:        float
    room_bill:                float
    hostel_bill:              float
    bill_difference_rupees:   float
    verdict:                  str
    room_reading_source:      str
    hostel_reading_source:    str
    verified_at:              datetime
    billing_period:           Optional[BillingPeriodOut] = None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Resolve forward references introduced by from __future__ import annotations
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RoomDetail references StudentOut and ApplianceOut defined below it.
# model_rebuild() forces Pydantic to re-evaluate all string annotations now
# that every class in this module is fully defined.
RoomDetail.model_rebuild()
