/**
 * BillShield Typed API Models
 * Exactly synchronized with FastAPI Pydantic schemas and SQLAlchemy models.
 */

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  db_tables: string[];
}

export type HostelType = "boys" | "girls";
export type Block = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type RoomType = "ac" | "non_ac";

export type ReadingSource =
  | "Manual Entry"
  | "Simulated Demo Data"
  | "Sensor (Future)";

export type Verdict =
  | "Readings Match"
  | "Minor Variation"
  | "Significant Mismatch";

export interface Student {
  id: number;
  room_id: number;
  name: string;
  roll_number: string;
  created_at: string;
}

export interface StudentCreate {
  room_id: number;
  name: string;
  roll_number: string;
}

export interface StudentUpdate {
  name?: string;
  roll_number?: string;
  room_id?: number;
}

export interface RoomCreate {
  hostel_type: HostelType;
  block: Block;
  room_number: string;
  room_type: RoomType;
  floor: number;
}

export interface RoomUpdate {
  hostel_type?: HostelType;
  block?: Block;
  room_number?: string;
  room_type?: RoomType;
  floor?: number;
}

export interface Appliance {
  id: number;
  room_id: number;
  name: string;
  rated_watts: number;
  quantity: number;
  assumed_daily_hours: number;
  daily_kwh_estimate?: number;
}

export interface Room {
  id: number;
  hostel_type: HostelType;
  block: Block;
  room_number: string;
  room_type: RoomType;
  floor: number;
  created_at: string;
}

export interface RoomDetail extends Room {
  students: Student[];
  appliances: Appliance[];
}

export interface BillingPeriod {
  id: number;
  period_start: string;
  period_end: string;
  label: string;
  created_at: string;
}

export interface BillingPeriodCreate {
  period_start: string;
  period_end: string;
  label: string;
}

export interface RoomReading {
  id: number;
  room_id: number;
  billing_period_id: number;
  reading_start: number;
  reading_end: number;
  consumption: number;
  source: ReadingSource;
  notes?: string | null;
  recorded_at: string;
  created_at: string;
  billing_period: BillingPeriod;
}

export interface RoomReadingCreate {
  billing_period_id: number;
  reading_start: number;
  reading_end: number;
  source: ReadingSource;
  notes?: string;
  recorded_at?: string;
}

export interface RoomReadingUpdate {
  reading_start?: number;
  reading_end?: number;
  recorded_at?: string;
  notes?: string;
}

export interface HostelMeterReading {
  id: number;
  room_id: number;
  billing_period_id: number;
  reading_start?: number | null;
  reading_end?: number | null;
  billed_units: number;
  billed_amount: number;
  source: ReadingSource;
  notes?: string | null;
  recorded_at: string;
  created_at: string;
  billing_period: BillingPeriod;
}

export interface HostelMeterReadingCreate {
  billing_period_id: number;
  reading_start?: number;
  reading_end?: number;
  billed_units?: number;
  billed_amount?: number;
  source: ReadingSource;
  notes?: string;
  recorded_at?: string;
}

export interface HostelMeterReadingUpdate {
  reading_start?: number;
  reading_end?: number;
  billed_units?: number;
  billed_amount?: number;
  recorded_at?: string;
  notes?: string;
}

export interface Settings {
  id: number;
  rate_per_unit: number;
  tolerance_percent: number;
  updated_at: string;
}

export interface SettingsUpdate {
  rate_per_unit?: number;
  tolerance_percent?: number;
}

export interface CompareResponse {
  room_id: number;
  billing_period_id: number;
  billing_period_label: string;
  period_start: string;
  period_end: string;
  room_reading_start: number;
  room_reading_end: number;
  room_recorded_at: string;
  hostel_reading_start?: number | null;
  hostel_reading_end?: number | null;
  hostel_recorded_at: string;
  room_units: number;
  hostel_units: number;
  difference_units: number;
  difference_percent: number;
  room_bill: number;
  hostel_bill: number;
  rate_per_unit: number;
  tolerance_percent: number;
  verdict: Verdict;
  room_reading_source: ReadingSource;
  hostel_reading_source: ReadingSource;
}

export interface AggregateDataPoint {
  label: string;
  period_start: string;
  period_end: string;
  room_consumption: number;
  hostel_consumption?: number | null;
  difference_units?: number | null;
  room_source?: ReadingSource | null;
  hostel_source?: ReadingSource | null;
}

export interface AggregateResponse {
  room_id: number;
  granularity: "hourly" | "daily" | "weekly" | "monthly";
  data_points: AggregateDataPoint[];
  is_interpolated: boolean;
  note: string;
}

export interface RoomTypeAveragePoint {
  label: string;
  ac_avg_kwh?: number | null;
  non_ac_avg_kwh?: number | null;
  difference_kwh?: number | null;
  is_simulated_demo: boolean;
}

export interface RoomTypeComparisonResponse {
  points: RoomTypeAveragePoint[];
  ac_overall_avg: number;
  non_ac_overall_avg: number;
  is_simulated_demo: boolean;
  note: string;
}

export interface SimulationRequest {
  billing_period_id: number;
  room_variance_percent?: number;
  hostel_variance_percent?: number;
  previous_reading_end?: number;
}

export interface SimulationResponse {
  message: string;
  room_reading: RoomReading;
  hostel_meter_reading: HostelMeterReading;
}

