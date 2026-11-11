/**
 * BillShield API Client
 * Typed fetch wrapper handling base URL, error parsing, and JSON serialization.
 */

import type {
  AggregateResponse,
  BillingPeriod,
  BillingPeriodCreate,
  CompareResponse,
  HealthResponse,
  HostelMeterReading,
  HostelMeterReadingCreate,
  HostelMeterReadingUpdate,
  Room,
  RoomCreate,
  RoomDetail,
  RoomReading,
  RoomReadingCreate,
  RoomReadingUpdate,
  RoomTypeComparisonResponse,
  RoomUpdate,
  Settings,
  SettingsUpdate,
  SimulationRequest,
  SimulationResponse,
  Student,
  StudentCreate,
  StudentUpdate,
} from "../types/api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP Error ${response.status}`;
    let errorData: unknown = null;
    try {
      errorData = await response.json();
      if (typeof errorData === "object" && errorData !== null && "detail" in errorData) {
        errorMessage = String((errorData as { detail: string }).detail);
      }
    } catch {
      // not JSON
    }
    throw new ApiError(response.status, errorMessage, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  // Rooms
  rooms: {
    list: (params?: { hostel_type?: string; block?: string; room_type?: string }) => {
      const q = new URLSearchParams();
      if (params?.hostel_type) q.append("hostel_type", params.hostel_type);
      if (params?.block) q.append("block", params.block);
      if (params?.room_type) q.append("room_type", params.room_type);
      const queryStr = q.toString() ? `?${q.toString()}` : "";
      return request<Room[]>(`/rooms${queryStr}`);
    },
    get: (id: number) => request<RoomDetail>(`/rooms/${id}`),
    create: (data: RoomCreate) =>
      request<RoomDetail>("/rooms", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: RoomUpdate) =>
      request<RoomDetail>(`/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },

  // Students
  students: {
    list: (roomId?: number) => {
      const q = roomId ? `?room_id=${roomId}` : "";
      return request<Student[]>(`/students${q}`);
    },
    get: (id: number) => request<Student>(`/students/${id}`),
    register: (data: StudentCreate) =>
      request<Student>("/students", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: StudentUpdate) =>
      request<Student>(`/students/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },

  // Billing Periods
  billingPeriods: {
    list: () => request<BillingPeriod[]>("/billing-periods"),
    create: (data: BillingPeriodCreate) =>
      request<BillingPeriod>("/billing-periods", { method: "POST", body: JSON.stringify(data) }),
  },

  // Room Readings
  readings: {
    list: (roomId: number) => request<RoomReading[]>(`/rooms/${roomId}/readings`),
    add: (roomId: number, data: RoomReadingCreate) =>
      request<RoomReading>(`/rooms/${roomId}/readings`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (readingId: number, data: RoomReadingUpdate) =>
      request<RoomReading>(`/readings/${readingId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (readingId: number) =>
      request<void>(`/readings/${readingId}`, { method: "DELETE" }),
  },

  // Hostel Meter Readings
  hostelMeter: {
    list: (roomId: number) => request<HostelMeterReading[]>(`/rooms/${roomId}/hostel-readings`),
    add: (roomId: number, data: HostelMeterReadingCreate) =>
      request<HostelMeterReading>(`/rooms/${roomId}/hostel-readings`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (readingId: number, data: HostelMeterReadingUpdate) =>
      request<HostelMeterReading>(`/hostel-readings/${readingId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (readingId: number) =>
      request<void>(`/hostel-readings/${readingId}`, { method: "DELETE" }),
  },

  // Report PDF URL builder
  report: {
    pdfUrl: (roomId: number, billingPeriodId: number, studentId?: number, inline = false) => {
      const q = new URLSearchParams({ billing_period_id: String(billingPeriodId) });
      if (studentId) q.append("student_id", String(studentId));
      if (inline) q.append("inline", "true");
      return `${BASE_URL}/rooms/${roomId}/report/pdf?${q.toString()}`;
    },
  },

  // Comparison & Verification
  compare: {
    get: (roomId: number, billingPeriodId: number) =>
      request<CompareResponse>(`/rooms/${roomId}/compare?billing_period_id=${billingPeriodId}`),
  },

  // Aggregation & Analytics
  aggregate: {
    get: (roomId: number, granularity: "hourly" | "daily" | "weekly" | "monthly" = "monthly") =>
      request<AggregateResponse>(`/rooms/${roomId}/aggregate?granularity=${granularity}`),
    roomTypeComparison: () =>
      request<RoomTypeComparisonResponse>("/analytics/room-type-comparison"),
  },

  // Simulation
  simulation: {
    generate: (roomId: number, data: SimulationRequest) =>
      request<SimulationResponse>(`/rooms/${roomId}/simulate`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  // Settings
  settings: {
    get: () => request<Settings>("/settings"),
    update: (data: SettingsUpdate) =>
      request<Settings>("/settings", { method: "PUT", body: JSON.stringify(data) }),
  },

  // Health
  health: {
    check: () => request<HealthResponse>("/health"),
  },
};

