import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRoom } from "../context/RoomContext";
import { useToast } from "../components/ui/Toast";
import { api } from "../api/client";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import { KpiCard } from "../components/ui/KpiCard";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { countInclusiveDays } from "../constants/hostel";
import type { CompareResponse, RoomReading, Settings } from "../types/api";

/** Returns a time-of-day salutation */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Formats ISO date string as "DD MMM YYYY" */
function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Verdict metadata helper */
function verdictMeta(verdict: string | null, tolerancePct: number) {
  if (!verdict) return { color: "text-slate-400", bg: "bg-slate-50", border: "border-slate-200", icon: "⏳", text: "No data yet" };
  if (verdict === "Readings Match")
    return { color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: "✅", text: `Within ±${tolerancePct}% tolerance` };
  if (verdict === "Minor Variation")
    return { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: "⚠️", text: "Moderate variance — check reading timestamps and boundaries" };
  return { color: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", icon: "📋", text: "Notable unit difference — check electrical boundary & period alignment" };
}

/** Mismatch % color class based on comparison to tolerance */
function mismatchColor(pct: number, tolerance: number): string {
  const abs = Math.abs(pct);
  if (abs <= tolerance) return "text-emerald-600";
  if (abs <= tolerance * 2) return "text-amber-600";
  return "text-rose-600";
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentStudent } = useAuth();
  const { selectedRoom, selectedRoomId, selectedPeriodId, billingPeriods } = useRoom();
  const { success, error: toastError } = useToast();

  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [readings, setReadings] = useState<RoomReading[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Inline settings editor state
  const [rateInput, setRateInput] = useState("");
  const [toleranceInput, setToleranceInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Appliance estimate collapsible
  const [showEstimate, setShowEstimate] = useState(false);

  // Track latest room id to ignore out-of-order responses when switching rooms
  const activeRoomRef = useRef<number | null>(selectedRoomId);
  activeRoomRef.current = selectedRoomId;

  const activePeriod = billingPeriods.find((p) => p.id === selectedPeriodId);

  // ── Data loader ───────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const requestRoomId = selectedRoomId;
    setLoading(true);
    setLoadError(null);
    setReadings([]);
    setComparison(null);
    try {
      // Always load settings (needed for rate display on KPI card)
      const settingsData = await api.settings.get();
      setSettings(settingsData);
      setRateInput(settingsData.rate_per_unit.toString());
      setToleranceInput(settingsData.tolerance_percent.toString());

      if (!requestRoomId) {
        setLoading(false);
        return;
      }

      const roomReadings = await api.readings.list(requestRoomId);
      if (activeRoomRef.current !== requestRoomId) return;
      setReadings(roomReadings);

      if (selectedPeriodId) {
        try {
          const comp = await api.compare.get(requestRoomId, selectedPeriodId);
          if (activeRoomRef.current === requestRoomId) setComparison(comp);
        } catch {
          if (activeRoomRef.current === requestRoomId) setComparison(null);
        }
      } else {
        setComparison(null);
      }
    } catch (err: unknown) {
      if (activeRoomRef.current !== requestRoomId) return;
      const msg = err instanceof Error ? err.message : "Failed to load dashboard data from API.";
      setLoadError(msg);
      console.error("Dashboard load error:", err);
    } finally {
      if (activeRoomRef.current === requestRoomId) setLoading(false);
    }
  }, [selectedRoomId, selectedPeriodId]);

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener("billshield:data-updated", handleUpdate);
    return () => window.removeEventListener("billshield:data-updated", handleUpdate);
  }, [loadData]);

  // ── Inline settings save ─────────────────────────────────────────────────
  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    const rateNum = parseFloat(rateInput);
    const tolNum = parseFloat(toleranceInput);
    if (isNaN(rateNum) || rateNum <= 0) {
      setSettingsError("Rate must be a positive number.");
      return;
    }
    if (isNaN(tolNum) || tolNum <= 0 || tolNum > 100) {
      setSettingsError("Tolerance must be between 0.1% and 100%.");
      return;
    }
    setSavingSettings(true);
    try {
      const updated = await api.settings.update({ rate_per_unit: rateNum, tolerance_percent: tolNum });
      setSettings(updated);
      success("Settings Updated", `Rate ₹${updated.rate_per_unit}/kWh · Tolerance ±${updated.tolerance_percent}%`);
      // Recompute comparison with new rate / tolerance
      window.dispatchEvent(new CustomEvent("billshield:data-updated"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update settings.";
      toastError("Save Failed", msg);
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Appliance theoretical estimate ───────────────────────────────────────
  const billingDays = activePeriod
    ? countInclusiveDays(activePeriod.period_start, activePeriod.period_end)
    : 30;

  const applianceEstimateKwh = selectedRoom?.appliances.reduce((sum, app) => {
    return sum + (app.rated_watts * app.quantity * app.assumed_daily_hours * billingDays) / 1000;
  }, 0) ?? 0;

  // ── Derived display values ────────────────────────────────────────────────
  const latestReading = readings[0];
  const displayUnits = comparison ? comparison.room_units : (latestReading?.consumption ?? null);
  const displayBill = comparison
    ? comparison.room_bill
    : latestReading && settings
    ? latestReading.consumption * settings.rate_per_unit
    : null;
  const mismatchPct = comparison?.difference_percent ?? null;
  const lastReadingDate = latestReading?.billing_period.period_end ?? null;
  const hasSimulatedData =
    comparison?.room_reading_source === "Simulated Demo Data" ||
    comparison?.hostel_reading_source === "Simulated Demo Data" ||
    latestReading?.source === "Simulated Demo Data";

  const vm = verdictMeta(comparison?.verdict ?? null, settings?.tolerance_percent ?? 5);

  // ── Skeleton loading state ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="card" className="h-44" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} variant="card" className="h-32" />
          ))}
        </div>
        <Skeleton variant="card" className="h-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton variant="card" className="h-40 lg:col-span-2" />
          <Skeleton variant="card" className="h-40" />
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── API Load Error Banner ──────────────────────────────────── */}
      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div>
            <p className="font-bold">Unable to load dashboard metrics</p>
            <p className="opacity-90 mt-0.5">{loadError}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {/* ── Simulated Data Warning Banner ─────────────────────────── */}
      {hasSimulatedData && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-xs uppercase tracking-wider text-amber-900">
                  Simulated Demo Data Notice
                </span>
                <Badge variant="source" sourceType="Simulated Demo Data" size="sm" />
              </div>
              <p className="text-xs text-amber-800/90 mt-0.5">
                Current dashboard statistics include synthetic demo data generated for demonstration purposes.
                Every reading is source-verified — simulated data is <strong>never</strong> presented as physical sensor measurements.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold text-amber-900/80 px-2.5 py-1 rounded-lg bg-amber-100/80 border border-amber-200 self-end sm:self-center whitespace-nowrap">
            Integrity Tagged
          </span>
        </div>
      )}

      {/* ── Personalized Greeting & Room Hero ─────────────────────── */}
      <div className="bg-navy-900 border border-navy-800 rounded-3xl p-6 sm:p-8 text-white shadow-card flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          {currentStudent ? (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-semibold mb-3 border border-white/10">
                <span>Aditya University · BillShield</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {getGreeting()}, {currentStudent.name}! 👋
              </h1>
              <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
                {selectedRoom ? (
                  <>
                    <span className="font-semibold text-white capitalize">{selectedRoom.hostel_type}</span> Hostel
                    {" · "}Block <span className="font-semibold text-white">{selectedRoom.block}</span>
                    {" · "}Room <span className="font-semibold text-white">{selectedRoom.room_number}</span>
                    {" · "}
                    <span className="font-semibold text-white uppercase">{selectedRoom.room_type.replace("_", "-")}</span>
                  </>
                ) : (
                  "No room selected — pick one from the sidebar."
                )}
              </p>
              {activePeriod && (
                <p className="mt-1 text-xs text-slate-400">
                  Viewing period:{" "}
                  <span className="text-white font-bold underline decoration-electric-400">{activePeriod.label}</span>
                </p>
              )}
            </>
          ) : (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-semibold mb-3 border border-white/10">
                <span>Aditya University · BillShield</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Room Electricity Monitor</h1>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-md">
                Register your student profile to get a personalized dashboard with your room's electricity records and bill verification.
              </p>
              <Link to="/register" className="mt-4 inline-block">
                <Button variant="primary" size="sm">
                  Register Now →
                </Button>
              </Link>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/register">
            <Button variant="secondary" size="md" className="bg-navy-800 text-white hover:bg-navy-700 border border-navy-600">
              Edit Room Details
            </Button>
          </Link>
          <Link to="/room">
            <Button variant="secondary" size="md" className="bg-navy-800 text-white hover:bg-navy-700 border border-navy-600">
              Room Config
            </Button>
          </Link>
          <Link to="/readings">
            <Button variant="secondary" size="md" className="bg-navy-800 text-white hover:bg-navy-700 border border-navy-600">
              + Enter Readings
            </Button>
          </Link>
          <Link to="/compare">
            <Button variant="primary" size="md">
              Run Verification →
            </Button>
          </Link>
        </div>
      </div>

      {/* ── 4 KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">

        {/* KPI 1: Units Used */}
        <KpiCard
          title="Units Used"
          value={displayUnits !== null ? displayUnits.toFixed(2) : "—"}
          unit="kWh"
          subtitle={comparison ? `For ${comparison.billing_period_label}` : "Latest reading"}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
          badge={
            comparison ? (
              <Badge variant="source" sourceType={comparison.room_reading_source} size="sm" />
            ) : latestReading ? (
              <Badge variant="source" sourceType={latestReading.source} size="sm" />
            ) : null
          }
        />

        {/* KPI 2: Estimated Bill */}
        <KpiCard
          title="Estimated Bill"
          value={displayBill !== null ? `₹${displayBill.toFixed(0)}` : "—"}
          subtitle={
            displayBill !== null && settings
              ? `@ ₹${settings.rate_per_unit}/kWh · ~₹${(displayBill / 3).toFixed(0)}/roommate (3)`
              : settings
              ? `@ ₹${settings.rate_per_unit}/kWh`
              : "Rate not loaded"
          }
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        {/* KPI 3: Mismatch % */}
        <KpiCard
          title="Mismatch %"
          value={
            mismatchPct !== null ? (
              <span className={mismatchColor(mismatchPct, settings?.tolerance_percent ?? 5)}>
                {mismatchPct > 0 ? "+" : ""}{mismatchPct.toFixed(2)}%
              </span>
            ) : (
              "—"
            )
          }
          subtitle={
            mismatchPct !== null
              ? `Tolerance ±${settings?.tolerance_percent ?? 5}%`
              : "Compare readings to see"
          }
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          badge={comparison ? <Badge variant="status" statusType={comparison.verdict} size="sm" /> : null}
        />

        {/* KPI 4: Last Reading Date */}
        <KpiCard
          title="Last Reading"
          value={lastReadingDate ? formatDate(lastReadingDate) : "—"}
          subtitle={lastReadingDate ? "Billing period end" : "No readings recorded"}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* ── Main Comparison Panel ──────────────────────────────────── */}
      {comparison ? (
        <Card
          className={`rounded-3xl border shadow-card overflow-hidden ${
            comparison.verdict === "Readings Match"
              ? "border-emerald-200"
              : comparison.verdict === "Minor Variation"
              ? "border-amber-200"
              : "border-rose-200"
          }`}
        >
          {/* Verdict header strip */}
          <div className={`px-6 pt-6 pb-5 ${vm.bg}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Verification Outcome · {comparison.billing_period_label}
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xl">{vm.icon}</span>
                  <h2 className={`text-2xl font-black tracking-tight ${vm.color}`}>{comparison.verdict}</h2>
                  <Badge variant="status" statusType={comparison.verdict} size="md" />
                </div>
                <p className={`text-xs mt-1.5 max-w-lg ${vm.color} opacity-80`}>{vm.text}</p>
              </div>
              {/* Difference pill */}
              <div className={`flex flex-col items-end gap-0.5 p-4 rounded-2xl bg-white/70 border ${vm.border} shadow-xs min-w-[140px]`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Difference</span>
                <span className="text-2xl font-black font-mono text-navy-900">
                  {comparison.difference_units > 0 ? "+" : ""}{comparison.difference_units.toFixed(2)}
                  <span className="text-sm font-semibold ml-1">kWh</span>
                </span>
                <span className={`text-sm font-bold font-mono ${vm.color}`}>
                  ({comparison.difference_percent > 0 ? "+" : ""}{comparison.difference_percent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Side-by-side meters */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* Left: Room Sensor */}
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Room Sensor Reading</span>
                <Badge variant="source" sourceType={comparison.room_reading_source} size="sm" />
              </div>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Start → End Reading</span>
                  <span className="text-xs font-bold font-mono text-navy-900">
                    {comparison.room_reading_start.toFixed(1)} → {comparison.room_reading_end.toFixed(1)} kWh
                  </span>
                </div>
                <div className="flex items-baseline justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Consumption (End − Start)</span>
                  <span className="text-2xl font-black font-mono text-navy-900">
                    {comparison.room_units.toFixed(2)}
                    <span className="text-sm font-normal ml-1">kWh</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Applied Rate</span>
                  <span className="text-sm font-bold font-mono text-navy-900">₹{comparison.rate_per_unit.toFixed(2)} / kWh</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-navy-900">Calculated Room Bill</span>
                  <span className="text-xl font-black font-mono text-blue-600">₹{comparison.room_bill.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Right: Hostel Meter */}
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Hostel Meter Reading</span>
                <Badge variant="source" sourceType={comparison.hostel_reading_source} size="sm" />
              </div>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Start → End Reading</span>
                  <span className="text-xs font-bold font-mono text-navy-900">
                    {comparison.hostel_reading_start != null && comparison.hostel_reading_end != null
                      ? `${comparison.hostel_reading_start.toFixed(1)} → ${comparison.hostel_reading_end.toFixed(1)} kWh`
                      : "Direct unit entry"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Consumption (End − Start)</span>
                  <span className="text-2xl font-black font-mono text-navy-900">
                    {comparison.hostel_units.toFixed(2)}
                    <span className="text-sm font-normal ml-1">kWh</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between pb-3 border-b border-slate-100">
                  <span className="text-xs text-slate-500">Applied Rate</span>
                  <span className="text-sm font-bold font-mono text-navy-900">₹{comparison.rate_per_unit.toFixed(2)} / kWh</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-navy-900">Total Billed Amount</span>
                  <span className="text-xl font-black font-mono text-navy-900">₹{comparison.hostel_bill.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer quick-link */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              Full side-by-side breakdown with detailed audit trail on the Compare page.
            </p>
            <Link to="/compare">
              <Button variant="primary" size="sm">View Full Verification →</Button>
            </Link>
          </div>
        </Card>
      ) : (
        /* No comparison data */
        <Card className="p-8 border-dashed border-2 border-slate-200">
          <EmptyState
            title="No Comparison Data Yet"
            description="Enter both a room sub-meter reading and an official hostel meter reading for the same billing period to run verification."
            actionLabel="+ Enter Readings"
            onAction={() => navigate("/readings")}
          />
        </Card>
      )}

      {/* ── Bottom Row: Inline Settings + Appliance Estimate ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Inline Settings Editor */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-electric-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <CardTitle>Billing Parameters</CardTitle>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Editable rate and tolerance — changes recalculate all comparisons instantly.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSettingsSave} className="space-y-4">
              <Input
                label="Rate per unit (₹ / kWh)"
                type="number"
                step="0.1"
                min="0.1"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                helperText="Default: ₹10.00"
              />
              <Input
                label="Match Tolerance (± %)"
                type="number"
                step="0.5"
                min="0.5"
                max="100"
                value={toleranceInput}
                onChange={(e) => setToleranceInput(e.target.value)}
                helperText="Default: ±5%"
              />
              {settingsError && (
                <p className="text-xs text-rose-600 font-medium">{settingsError}</p>
              )}
              <Button type="submit" variant="primary" className="w-full" isLoading={savingSettings}>
                Save Parameters
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Appliance-Based Theoretical Estimate */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Appliance Inventory & Theoretical Estimate</CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedRoom?.room_type.replace("_", "-").toUpperCase()} room · {selectedRoom?.hostel_type} hostel
                </p>
              </div>
              <button
                type="button"
                aria-expanded={showEstimate}
                onClick={() => setShowEstimate((p) => !p)}
                className="text-xs font-bold text-electric-600 hover:text-electric-700 px-3 py-1.5 rounded-lg border border-electric-200 hover:bg-electric-50 transition-colors"
              >
                {showEstimate ? "Hide Estimate" : "Show Estimate"}
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Warning disclaimer — always visible */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2">
              <span>⚡</span>
              <span>Theoretical Estimate Only — Not a Measured Value. These figures are based on appliance wattage assumptions, not actual meter readings.</span>
            </div>

            {/* Appliance rows */}
            {selectedRoom?.appliances.map((app) => {
              const periodKwh = (app.rated_watts * app.quantity * app.assumed_daily_hours * billingDays) / 1000;
              return (
                <div
                  key={app.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <div>
                    <p className="text-xs font-bold text-navy-900">{app.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {app.quantity}× · {app.rated_watts}W · ~{app.assumed_daily_hours}h/day
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-navy-900 font-mono">
                      ~{periodKwh.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 block">kWh / period</span>
                  </div>
                </div>
              );
            })}

            {/* Period estimate total + comparison vs actual */}
            {showEstimate && (
              <div className="mt-2 p-4 rounded-2xl bg-navy-900 text-white space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-slate-300">Total Theoretical Estimate</span>
                  <span className="text-xl font-black font-mono text-blue-300">
                    ~{applianceEstimateKwh.toFixed(2)} kWh
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">Period ({billingDays} days)</span>
                  <span className="text-xs font-bold text-slate-300 font-mono">
                    ~₹{(applianceEstimateKwh * (settings?.rate_per_unit ?? 10)).toFixed(0)}
                  </span>
                </div>
                {displayUnits !== null && (
                  <>
                    <div className="border-t border-white/10 pt-2 flex items-baseline justify-between">
                      <span className="text-xs text-slate-400">Actual Recorded</span>
                      <span className="text-xs font-bold text-slate-300 font-mono">{displayUnits.toFixed(2)} kWh</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-400">Deviation from estimate</span>
                      <span className="text-xs font-bold text-blue-300 font-mono">
                        {displayUnits - applianceEstimateKwh > 0 ? "+" : ""}
                        {(displayUnits - applianceEstimateKwh).toFixed(2)} kWh
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 pt-1">
                      Estimates assume fixed daily usage hours; actual usage will vary based on occupancy and behaviour.
                    </p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Meter History ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Meter History</CardTitle>
            <Link to="/readings" className="text-xs font-bold text-blue-600 hover:text-blue-700">
              View All →
            </Link>
          </div>
          <p className="text-xs text-slate-500 mt-1">Source-tagged readings for this room</p>
        </CardHeader>
        <CardContent>
          {readings.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No meter readings recorded yet. Use{" "}
              <Link to="/readings" className="font-bold text-blue-600 hover:underline">Enter Readings</Link>{" "}
              to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Billing Period</th>
                    <th className="py-2.5 px-3">Start kWh</th>
                    <th className="py-2.5 px-3">End kWh</th>
                    <th className="py-2.5 px-3">Consumption</th>
                    <th className="py-2.5 px-3">Source Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {readings.slice(0, 5).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3 font-semibold text-navy-900">{r.billing_period.label}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">{r.reading_start.toFixed(1)}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">{r.reading_end.toFixed(1)}</td>
                      <td className="py-3 px-3 font-mono font-bold text-navy-900">{r.consumption.toFixed(2)} kWh</td>
                      <td className="py-3 px-3">
                        <Badge variant="source" sourceType={r.source} size="sm" />
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
  );
};
