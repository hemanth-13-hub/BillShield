import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Button,
  Badge,
  Modal,
  EmptyState,
} from "../components/ui";
import { formatHostelType, formatRoomType } from "../constants/hostel";
import type { CompareResponse, HostelMeterReading, RoomReading } from "../types/api";

/** Returns local datetime-local string e.g. "2026-11-12T00:15" */
function currentLocalDateTimeInput(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

/** Formats ISO timestamp cleanly in IST */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export const ReadingsPage: React.FC = () => {
  const { selectedRoomId, selectedRoom, billingPeriods, selectedPeriodId } = useRoom();
  const { success, error } = useToast();

  const [roomReadings, setRoomReadings] = useState<RoomReading[]>([]);
  const [hostelReadings, setHostelReadings] = useState<HostelMeterReading[]>([]);
  const [periodComparison, setPeriodComparison] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Per-source period selectors (default synced to header selectedPeriodId)
  const [roomPeriodId, setRoomPeriodId] = useState<number | "">(selectedPeriodId ?? "");
  const [hostelPeriodId, setHostelPeriodId] = useState<number | "">(selectedPeriodId ?? "");

  // 1. Room Sensor Reading Form State (Manual Demo Entry — No Physical Sensor)
  const [roomStart, setRoomStart] = useState("");
  const [roomEnd, setRoomEnd] = useState("");
  const [roomDateTime, setRoomDateTime] = useState(currentLocalDateTimeInput);
  const [roomNotes, setRoomNotes] = useState("");
  const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);

  // 2. Hostel Meter Reading Form State
  const [hostelStart, setHostelStart] = useState("");
  const [hostelEnd, setHostelEnd] = useState("");
  const [hostelAmountOverride, setHostelAmountOverride] = useState("");
  const [hostelDateTime, setHostelDateTime] = useState(currentLocalDateTimeInput);
  const [hostelNotes, setHostelNotes] = useState("");
  const [isSubmittingHostel, setIsSubmittingHostel] = useState(false);

  // Simulation Modal State
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simVariance, setSimVariance] = useState<number>(5.0);
  const [isSimulating, setIsSimulating] = useState(false);

  // Settings rate for real-time cost preview
  const [ratePerUnit, setRatePerUnit] = useState<number>(10);

  // Delete confirmation modal state
  const [pendingDelete, setPendingDelete] = useState<{ type: "room" | "hostel"; id: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeRoomRef = useRef<number | null>(selectedRoomId);
  activeRoomRef.current = selectedRoomId;

  // Sync default billing period when header selector changes
  useEffect(() => {
    if (selectedPeriodId) {
      setRoomPeriodId(selectedPeriodId);
      setHostelPeriodId(selectedPeriodId);
    }
  }, [selectedPeriodId]);

  const activePeriod = billingPeriods.find((p) => p.id === selectedPeriodId);

  const loadReadings = useCallback(async () => {
    const requestRoomId = selectedRoomId;
    setRoomReadings([]);
    setHostelReadings([]);
    setPeriodComparison(null);

    try {
      const settingsData = await api.settings.get();
      setRatePerUnit(settingsData.rate_per_unit);
    } catch {
      // Fallback to default ₹10
    }

    if (!requestRoomId) return;
    setLoading(true);
    try {
      const [rr, hr] = await Promise.all([
        api.readings.list(requestRoomId),
        api.hostelMeter.list(requestRoomId),
      ]);
      if (activeRoomRef.current !== requestRoomId) return;
      setRoomReadings(rr);
      setHostelReadings(hr);

      if (selectedPeriodId) {
        try {
          const comp = await api.compare.get(requestRoomId, selectedPeriodId);
          if (activeRoomRef.current === requestRoomId) setPeriodComparison(comp);
        } catch {
          if (activeRoomRef.current === requestRoomId) setPeriodComparison(null);
        }
      }
    } catch (err: any) {
      if (activeRoomRef.current === requestRoomId) {
        error("Error Loading Readings", err.message);
      }
    } finally {
      if (activeRoomRef.current === requestRoomId) setLoading(false);
    }
  }, [selectedRoomId, selectedPeriodId, error]);

  useEffect(() => {
    loadReadings();
    const handleUpdate = () => loadReadings();
    window.addEventListener("billshield:data-updated", handleUpdate);
    return () => window.removeEventListener("billshield:data-updated", handleUpdate);
  }, [loadReadings]);

  // Real-time consumption calculations: ending - starting
  const numRoomStart = parseFloat(roomStart);
  const numRoomEnd = parseFloat(roomEnd);
  const hasValidRoomNums = !isNaN(numRoomStart) && !isNaN(numRoomEnd);
  const roomConsumption = hasValidRoomNums && numRoomEnd > numRoomStart ? numRoomEnd - numRoomStart : 0;

  const numHostelStart = parseFloat(hostelStart);
  const numHostelEnd = parseFloat(hostelEnd);
  const hasValidHostelNums = !isNaN(numHostelStart) && !isNaN(numHostelEnd);
  const hostelConsumption =
    hasValidHostelNums && numHostelEnd > numHostelStart ? numHostelEnd - numHostelStart : 0;
  const computedHostelBill = hostelConsumption * ratePerUnit;

  // Check if selected form periods differ
  const periodsAligned =
    roomPeriodId !== "" && hostelPeriodId !== "" && Number(roomPeriodId) === Number(hostelPeriodId);

  const hasSimulatedInCurrentPeriod =
    roomReadings.some(
      (r) => r.billing_period_id === selectedPeriodId && r.source === "Simulated Demo Data"
    ) ||
    hostelReadings.some(
      (h) => h.billing_period_id === selectedPeriodId && h.source === "Simulated Demo Data"
    );

  const handleRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || !roomPeriodId) {
      error("Missing Selection", "Please select a room and billing period.");
      return;
    }
    if (!hasValidRoomNums) {
      error("Validation", "Starting and ending Room Sensor readings must be valid numbers.");
      return;
    }
    if (numRoomStart < 0 || numRoomEnd < 0) {
      error("Validation", "Room Sensor readings cannot be negative.");
      return;
    }
    if (numRoomEnd <= numRoomStart) {
      error("Validation", "Ending reading must be strictly greater than starting reading.");
      return;
    }
    if (!roomDateTime) {
      error("Validation", "Please record the reading date and time.");
      return;
    }

    setIsSubmittingRoom(true);
    try {
      await api.readings.add(selectedRoomId, {
        billing_period_id: Number(roomPeriodId),
        reading_start: numRoomStart,
        reading_end: numRoomEnd,
        source: "Manual Entry",
        recorded_at: new Date(roomDateTime).toISOString(),
        notes: roomNotes.trim() || undefined,
      });
      success(
        "Room Sensor Reading Saved",
        `Recorded ${roomConsumption.toFixed(2)} kWh (Manual Demo Entry).`
      );
      setRoomStart("");
      setRoomEnd("");
      setRoomNotes("");
      setRoomDateTime(currentLocalDateTimeInput());
      await loadReadings();
      window.dispatchEvent(new CustomEvent("billshield:data-updated"));
    } catch (err: any) {
      error("Failed to Save Room Sensor Reading", err.message);
    } finally {
      setIsSubmittingRoom(false);
    }
  };

  const handleHostelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || !hostelPeriodId) {
      error("Missing Selection", "Please select a room and billing period.");
      return;
    }
    if (!hasValidHostelNums) {
      error("Validation", "Starting and ending Hostel Meter readings must be valid numbers.");
      return;
    }
    if (numHostelStart < 0 || numHostelEnd < 0) {
      error("Validation", "Hostel Meter readings cannot be negative.");
      return;
    }
    if (numHostelEnd <= numHostelStart) {
      error("Validation", "Hostel Meter ending reading must be strictly greater than starting reading.");
      return;
    }
    if (!hostelDateTime) {
      error("Validation", "Please record the hostel meter reading date and time.");
      return;
    }

    const parsedAmount =
      hostelAmountOverride.trim() !== "" ? parseFloat(hostelAmountOverride) : undefined;
    if (parsedAmount !== undefined && (isNaN(parsedAmount) || parsedAmount < 0)) {
      error("Validation", "Hostel bill amount must be zero or positive.");
      return;
    }

    setIsSubmittingHostel(true);
    try {
      await api.hostelMeter.add(selectedRoomId, {
        billing_period_id: Number(hostelPeriodId),
        reading_start: numHostelStart,
        reading_end: numHostelEnd,
        billed_units: Number(hostelConsumption.toFixed(4)),
        billed_amount: parsedAmount,
        source: "Manual Entry",
        recorded_at: new Date(hostelDateTime).toISOString(),
        notes: hostelNotes.trim() || undefined,
      });
      success(
        "Hostel Meter Reading Saved",
        `Recorded ${hostelConsumption.toFixed(2)} kWh (Manual Entry).`
      );
      setHostelStart("");
      setHostelEnd("");
      setHostelAmountOverride("");
      setHostelNotes("");
      setHostelDateTime(currentLocalDateTimeInput());
      await loadReadings();
      window.dispatchEvent(new CustomEvent("billshield:data-updated"));
    } catch (err: any) {
      error("Failed to Save Hostel Meter Reading", err.message);
    } finally {
      setIsSubmittingHostel(false);
    }
  };

  const handleSimulate = async () => {
    if (!selectedRoomId || !selectedPeriodId) {
      error("Error", "Please select a room and billing period.");
      return;
    }
    setIsSimulating(true);
    try {
      const res = await api.simulation.generate(selectedRoomId, {
        billing_period_id: selectedPeriodId,
        room_variance_percent: simVariance,
        hostel_variance_percent: 3.0,
      });
      success("SIMULATED Data Created", res.message);
      setIsSimulateModalOpen(false);
      await loadReadings();
      window.dispatchEvent(new CustomEvent("billshield:data-updated"));
    } catch (err: any) {
      error("Simulation Failed", err.message);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      if (pendingDelete.type === "room") {
        await api.readings.delete(pendingDelete.id);
        success("Deleted", "Room sensor reading removed.");
      } else {
        await api.hostelMeter.delete(pendingDelete.id);
        success("Deleted", "Hostel meter reading removed.");
      }
      setPendingDelete(null);
      await loadReadings();
      window.dispatchEvent(new CustomEvent("billshield:data-updated"));
    } catch (err: any) {
      error("Delete Failed", err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!selectedRoom) {
    return (
      <EmptyState
        title="No Room Selected"
        description="Register a hostel room first to enter independent Room Sensor and Hostel Meter readings."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 dark:text-dark-text tracking-tight">
            Dual Meter Monitoring
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-dark-muted mt-1">
            Room #{selectedRoom.room_number} ({formatRoomType(selectedRoom.room_type)}) ·{" "}
            {formatHostelType(selectedRoom.hostel_type)} · Block {selectedRoom.block}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsSimulateModalOpen(true)}
          className="border-electric-200 text-electric-700 hover:bg-electric-50 self-start sm:self-auto"
          leftIcon={
            <svg className="w-4 h-4 text-electric-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        >
          Generate Simulated Demo Data
        </Button>
      </div>

      {/* Mandatory Demo & Hardware Honesty + Electrical Boundary Explanation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          role="note"
          className="p-4 rounded-2xl bg-slate-50 dark:bg-dark-card border border-slate-200 dark:border-dark-border text-xs leading-relaxed"
        >
          <p className="font-bold text-navy-900 dark:text-dark-text uppercase tracking-wider text-[11px] mb-1">
            Demo Entry Mode · No Physical Sensor Connected
          </p>
          <p className="text-slate-600 dark:text-dark-muted">
            No ESP32 or physical hardware sensor is connected in this demo. Enter values manually from both
            meters below; any sample readings generated by the simulator are strictly marked{" "}
            <strong className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">SIMULATED DATA</strong>.
          </p>
        </div>

        <div
          role="note"
          className="p-4 rounded-2xl bg-electric-50 dark:bg-electric-950/20 border border-electric-200 dark:border-electric-800 text-xs leading-relaxed"
        >
          <p className="font-bold text-electric-900 dark:text-electric-400 uppercase tracking-wider text-[11px] mb-1">
            Same Electrical Boundary &amp; Billing Period Rule
          </p>
          <p className="text-slate-700 dark:text-dark-muted">
            Both the Room Sensor Reading and Hostel Meter Reading must measure the{" "}
            <strong>exact same electrical circuit boundary</strong> (Room #{selectedRoom.room_number} load only)
            and cover the <strong>identical billing period</strong> to produce a valid comparison.
          </p>
        </div>
      </div>

      {/* Period Alignment Validation Alert */}
      {!periodsAligned && roomPeriodId !== "" && hostelPeriodId !== "" && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div>
            <strong>Billing Period Mismatch Selected:</strong> Your Room Sensor form targets{" "}
            <strong>{billingPeriods.find((b) => b.id === Number(roomPeriodId))?.label}</strong> while your Hostel
            Meter form targets{" "}
            <strong>{billingPeriods.find((b) => b.id === Number(hostelPeriodId))?.label}</strong>. Select the same
            billing period on both forms so readings can be compared.
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHostelPeriodId(Number(roomPeriodId))}
            className="flex-shrink-0 bg-white"
          >
            Align Both Periods
          </Button>
        </div>
      )}

      {/* Prominent Simulated Data Warning Banner */}
      {hasSimulatedInCurrentPeriod && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">⚠️</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-xs uppercase tracking-wider text-amber-900">
                  Simulated Sample Data Present
                </span>
                <Badge variant="source" sourceType="Simulated Demo Data" size="sm" />
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                Readings for <strong>{activePeriod?.label}</strong> include SIMULATED sample data and must never
                be presented as real physical sensor measurements.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Dual Entry Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source 1: Room Sensor Reading */}
        <Card className="border-t-4 border-t-electric-600">
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle>1. Room Sensor Reading</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Independent room circuit measurement (Manual Demo Input)
                </p>
              </div>
              <Badge variant="source" sourceType="Manual Entry" size="sm" />
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleRoomSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="room-period-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Billing Period *
                  </label>
                  <select
                    id="room-period-select"
                    value={roomPeriodId}
                    onChange={(e) => setRoomPeriodId(Number(e.target.value))}
                    className="w-full text-xs sm:text-sm font-medium border border-slate-200 dark:border-dark-border rounded-xl p-2 bg-white dark:bg-dark-card dark:text-dark-text focus:ring-2 focus:ring-electric-500 focus:outline-none"
                  >
                    {billingPeriods.map((bp) => (
                      <option key={bp.id} value={bp.id}>
                        {bp.label} ({bp.period_start} to {bp.period_end})
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Reading Date & Time *"
                  type="datetime-local"
                  value={roomDateTime}
                  onChange={(e) => setRoomDateTime(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Starting Reading (kWh) *"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter start reading"
                  value={roomStart}
                  onChange={(e) => setRoomStart(e.target.value)}
                  required
                />
                <Input
                  label="Ending Reading (kWh) *"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter end reading"
                  value={roomEnd}
                  onChange={(e) => setRoomEnd(e.target.value)}
                  required
                />
              </div>

              {hasValidRoomNums && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    numRoomEnd > numRoomStart
                      ? "bg-electric-50/60 border-electric-200 text-navy-900"
                      : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}
                >
                  {numRoomEnd > numRoomStart ? (
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        Consumption ({numRoomEnd} − {numRoomStart}):{" "}
                        <strong className="font-mono">{roomConsumption.toFixed(2)} kWh</strong>
                      </span>
                      <span className="font-mono font-bold text-electric-700">
                        Est. ₹{(roomConsumption * ratePerUnit).toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <p className="font-semibold">
                      Ending reading must exceed starting reading.
                    </p>
                  )}
                </div>
              )}

              <Input
                label="Notes (Optional)"
                placeholder="e.g. Manual meter reading check"
                value={roomNotes}
                onChange={(e) => setRoomNotes(e.target.value)}
              />

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                isLoading={isSubmittingRoom}
                disabled={hasValidRoomNums && numRoomEnd <= numRoomStart}
              >
                Save Room Sensor Reading
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Source 2: Hostel Meter Reading */}
        <Card className="border-t-4 border-t-navy-900">
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle>2. Hostel Meter Reading</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Existing hostel meter used for billing (Manual Entry)
                </p>
              </div>
              <Badge variant="source" sourceType="Manual Entry" size="sm" />
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleHostelSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="hostel-period-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Billing Period *
                  </label>
                  <select
                    id="hostel-period-select"
                    value={hostelPeriodId}
                    onChange={(e) => setHostelPeriodId(Number(e.target.value))}
                    className="w-full text-xs sm:text-sm font-medium border border-slate-200 dark:border-dark-border rounded-xl p-2 bg-white dark:bg-dark-card dark:text-dark-text focus:ring-2 focus:ring-electric-500 focus:outline-none"
                  >
                    {billingPeriods.map((bp) => (
                      <option key={bp.id} value={bp.id}>
                        {bp.label} ({bp.period_start} to {bp.period_end})
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Reading Date & Time *"
                  type="datetime-local"
                  value={hostelDateTime}
                  onChange={(e) => setHostelDateTime(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Starting Reading (kWh) *"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter start reading"
                  value={hostelStart}
                  onChange={(e) => setHostelStart(e.target.value)}
                  required
                />
                <Input
                  label="Ending Reading (kWh) *"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter end reading"
                  value={hostelEnd}
                  onChange={(e) => setHostelEnd(e.target.value)}
                  required
                />
              </div>

              {hasValidHostelNums && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    numHostelEnd > numHostelStart
                      ? "bg-slate-50 border-slate-200 text-navy-900"
                      : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}
                >
                  {numHostelEnd > numHostelStart ? (
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        Consumption ({numHostelEnd} − {numHostelStart}):{" "}
                        <strong className="font-mono">{hostelConsumption.toFixed(2)} kWh</strong>
                      </span>
                      <span className="font-mono font-bold text-navy-900">
                        Calculated ₹{computedHostelBill.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <p className="font-semibold">
                      Ending reading must exceed starting reading.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Billed Amount Override (₹, Optional)"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={hasValidHostelNums ? `Default ₹${computedHostelBill.toFixed(2)}` : "Auto from rate"}
                  value={hostelAmountOverride}
                  onChange={(e) => setHostelAmountOverride(e.target.value)}
                />
                <Input
                  label="Notes (Optional)"
                  placeholder="e.g. Hostel register entry"
                  value={hostelNotes}
                  onChange={(e) => setHostelNotes(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                variant="secondary"
                className="w-full"
                isLoading={isSubmittingHostel}
                disabled={hasValidHostelNums && numHostelEnd <= numHostelStart}
              >
                Save Hostel Meter Reading
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Instant Side-by-Side Comparison Summary (Active Billing Period) */}
      {periodComparison && (
        <Card className="border-2 border-slate-200 dark:border-dark-border">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle>
                  Dual Meter Comparison · {periodComparison.billing_period_label}
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Side-by-side readings for Room #{selectedRoom.room_number} covering identical billing period
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="status" statusType={periodComparison.verdict} size="md" />
                <Link to="/compare">
                  <Button variant="primary" size="sm">Full Comparison View →</Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-electric-50/50 border border-electric-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-electric-800">Room Sensor</span>
                <Badge variant="source" sourceType={periodComparison.room_reading_source} size="sm" />
              </div>
              <p className="text-xl font-black font-mono text-navy-900">
                {periodComparison.room_units.toFixed(2)} kWh
              </p>
              <p className="text-slate-600 font-mono">
                {periodComparison.room_reading_start.toFixed(1)} → {periodComparison.room_reading_end.toFixed(1)} kWh
              </p>
              <p className="text-[11px] text-slate-500">
                Recorded: {formatDateTime(periodComparison.room_recorded_at)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-center items-center text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Difference in Units
              </span>
              <p className="text-2xl font-black font-mono text-navy-900 mt-1">
                {periodComparison.difference_units > 0 ? "+" : ""}
                {periodComparison.difference_units.toFixed(2)} kWh
              </p>
              <span className="text-xs font-bold font-mono text-slate-600 mt-0.5">
                ({periodComparison.difference_percent > 0 ? "+" : ""}
                {periodComparison.difference_percent.toFixed(2)}% · Tolerance ±{periodComparison.tolerance_percent}%)
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-slate-700">Hostel Meter</span>
                <Badge variant="source" sourceType={periodComparison.hostel_reading_source} size="sm" />
              </div>
              <p className="text-xl font-black font-mono text-navy-900">
                {periodComparison.hostel_units.toFixed(2)} kWh
              </p>
              <p className="text-slate-600 font-mono">
                {periodComparison.hostel_reading_start != null && periodComparison.hostel_reading_end != null
                  ? `${periodComparison.hostel_reading_start.toFixed(1)} → ${periodComparison.hostel_reading_end.toFixed(1)} kWh`
                  : "Billed units entry"}
              </p>
              <p className="text-[11px] text-slate-500">
                Recorded: {formatDateTime(periodComparison.hostel_recorded_at)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dual Independent Records Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Room Sensor History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Room Sensor Records ({roomReadings.length})</CardTitle>
              <span className="text-[11px] text-slate-400">Room #{selectedRoom.room_number} only</span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-xs text-slate-400 py-6 text-center">Loading records…</p>
            ) : roomReadings.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No Room Sensor readings saved for Room #{selectedRoom.room_number} yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-dark-border text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="py-2 px-2.5">Period</th>
                      <th className="py-2 px-2.5">Start → End</th>
                      <th className="py-2 px-2.5">Units</th>
                      <th className="py-2 px-2.5">Recorded</th>
                      <th className="py-2 px-2.5">Source</th>
                      <th className="py-2 px-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-dark-border">
                    {roomReadings.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-2.5 font-semibold text-navy-900 dark:text-dark-text">
                          {r.billing_period.label}
                        </td>
                        <td className="py-2.5 px-2.5 font-mono text-slate-600">
                          {r.reading_start.toFixed(1)} → {r.reading_end.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-2.5 font-mono font-bold text-navy-900 dark:text-dark-text">
                          {r.consumption.toFixed(2)} kWh
                        </td>
                        <td className="py-2.5 px-2.5 text-[11px] text-slate-500">
                          {formatDateTime(r.recorded_at)}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <Badge variant="source" sourceType={r.source} size="sm" />
                        </td>
                        <td className="py-2.5 px-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setPendingDelete({ type: "room", id: r.id })}
                            className="text-red-500 hover:text-red-700 font-bold px-2 py-1 text-[11px] rounded"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hostel Meter History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Hostel Meter Records ({hostelReadings.length})</CardTitle>
              <span className="text-[11px] text-slate-400">Room #{selectedRoom.room_number} only</span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-xs text-slate-400 py-6 text-center">Loading records…</p>
            ) : hostelReadings.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No Hostel Meter readings saved for Room #{selectedRoom.room_number} yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-dark-border text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="py-2 px-2.5">Period</th>
                      <th className="py-2 px-2.5">Start → End</th>
                      <th className="py-2 px-2.5">Units</th>
                      <th className="py-2 px-2.5">Recorded</th>
                      <th className="py-2 px-2.5">Source</th>
                      <th className="py-2 px-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-dark-border">
                    {hostelReadings.map((hr) => (
                      <tr key={hr.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-2.5 font-semibold text-navy-900 dark:text-dark-text">
                          {hr.billing_period.label}
                        </td>
                        <td className="py-2.5 px-2.5 font-mono text-slate-600">
                          {hr.reading_start != null && hr.reading_end != null
                            ? `${hr.reading_start.toFixed(1)} → ${hr.reading_end.toFixed(1)}`
                            : "Direct"}
                        </td>
                        <td className="py-2.5 px-2.5 font-mono font-bold text-navy-900 dark:text-dark-text">
                          {hr.billed_units.toFixed(2)} kWh
                        </td>
                        <td className="py-2.5 px-2.5 text-[11px] text-slate-500">
                          {formatDateTime(hr.recorded_at)}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <Badge variant="source" sourceType={hr.source} size="sm" />
                        </td>
                        <td className="py-2.5 px-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setPendingDelete({ type: "hostel", id: hr.id })}
                            className="text-red-500 hover:text-red-700 font-bold px-2 py-1 text-[11px] rounded"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Simulation Modal */}
      <Modal
        isOpen={isSimulateModalOpen}
        onClose={() => setIsSimulateModalOpen(false)}
        title="Generate Simulated Demo Data"
        description="Creates synthetic Room Sensor & Hostel Meter readings tagged strictly as SIMULATED DATA."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsSimulateModalOpen(false)}
              disabled={isSimulating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={isSimulating}
              onClick={handleSimulate}
            >
              Generate SIMULATED Data
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed font-medium">
            <span className="font-bold">⚠️ SIMULATED DATA Notice:</span> Generated readings are sample values for
            demonstration only and will never be presented as real physical sensor measurements.
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Target Billing Period
            </span>
            <p className="text-sm font-bold text-navy-900 dark:text-dark-text bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-dark-border">
              {activePeriod ? `${activePeriod.label} (${activePeriod.period_start} to ${activePeriod.period_end})` : "Select a period"}
            </p>
          </div>

          <Input
            label="Random Variance (± %)"
            type="number"
            min={0}
            max={50}
            step={1}
            value={simVariance}
            onChange={(e) => setSimVariance(Number(e.target.value))}
            helperText="Calculates baseline from room appliances plus this variance."
          />
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => !isDeleting && setPendingDelete(null)}
        title={pendingDelete?.type === "room" ? "Delete Room Sensor Reading" : "Delete Hostel Meter Reading"}
        description="This action permanently removes the selected reading record."
        maxWidth="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPendingDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              isLoading={isDeleting}
              onClick={handleConfirmDelete}
            >
              Delete Reading
            </Button>
          </>
        }
      >
        <p className="text-xs text-slate-600 dark:text-dark-muted leading-relaxed">
          Are you sure you want to delete this{" "}
          <span className="font-bold text-navy-900 dark:text-dark-text">
            {pendingDelete?.type === "room" ? "Room Sensor" : "Hostel Meter"}
          </span>{" "}
          reading? Comparisons for that billing period will remain unavailable until both sources are recorded.
        </p>
      </Modal>
    </div>
  );
};
