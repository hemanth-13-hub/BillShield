import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import { api } from "../api/client";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import type { CompareResponse } from "../types/api";

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

export const ComparePage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedRoom, selectedRoomId, billingPeriods, selectedPeriodId, setSelectedPeriodId } = useRoom();

  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeRoomRef = useRef<number | null>(selectedRoomId);
  activeRoomRef.current = selectedRoomId;

  const fetchComparison = useCallback(async () => {
    const requestRoomId = selectedRoomId;
    setComparison(null);
    setErrorMessage(null);
    if (!requestRoomId || !selectedPeriodId) return;
    setLoading(true);
    try {
      const data = await api.compare.get(requestRoomId, selectedPeriodId);
      if (activeRoomRef.current === requestRoomId) setComparison(data);
    } catch (err: any) {
      if (activeRoomRef.current === requestRoomId) {
        setComparison(null);
        setErrorMessage(err.message || "Failed to compare readings for this period.");
      }
    } finally {
      if (activeRoomRef.current === requestRoomId) setLoading(false);
    }
  }, [selectedRoomId, selectedPeriodId]);

  useEffect(() => {
    fetchComparison();
    const handleUpdate = () => fetchComparison();
    window.addEventListener("billshield:data-updated", handleUpdate);
    return () => window.removeEventListener("billshield:data-updated", handleUpdate);
  }, [fetchComparison]);

  const hasSimulated =
    comparison?.room_reading_source === "Simulated Demo Data" ||
    comparison?.hostel_reading_source === "Simulated Demo Data";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-th-text tracking-tight">
            Dual Meter Comparison
          </h1>
          <p className="text-xs sm:text-sm text-th-textMuted mt-1">
            Compare independent Room Sensor consumption against Hostel Meter billing records for{" "}
            <strong className="text-th-text">Room #{selectedRoom?.room_number ?? "—"}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="compare-period-select" className="text-xs font-semibold text-th-textMuted">
            Period:
          </label>
          <select
            id="compare-period-select"
            value={selectedPeriodId || ""}
            onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
            className="text-xs sm:text-sm font-bold bg-th-card border border-th-border rounded-xl px-3 py-2 text-th-text focus:outline-none focus:border-th-accent shadow-xs"
          >
            {billingPeriods.map((bp) => (
              <option key={bp.id} value={bp.id} className="bg-th-card text-th-text">
                {bp.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Hardware Honesty Notice */}
      <div
        role="note"
        className="p-3.5 rounded-2xl bg-th-surface border border-th-border text-xs text-th-textSub flex flex-col sm:flex-row sm:items-center justify-between gap-2"
      >
        <span>
          <strong className="text-th-text">Measurement Status:</strong> Manual demo entry mode — no physical ESP32 energy sensor is currently connected.
        </span>
        {hasSimulated && <Badge variant="source" sourceType="Simulated Demo Data" size="sm" />}
      </div>

      {hasSimulated && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-th-warnBg border-2 border-th-warnBdr text-th-warnTxt text-xs leading-relaxed"
        >
          <strong>⚠️ SIMULATED DATA Notice:</strong> Sample readings tagged{" "}
          <strong className="underline">SIMULATED DATA</strong> are shown for demonstration purposes only and must
          never be represented as real physical sensor measurements.
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton variant="card" className="h-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton variant="card" className="h-48" />
            <Skeleton variant="card" className="h-48" />
          </div>
        </div>
      ) : errorMessage || !comparison ? (
        <Card className="p-8 text-center border-dashed border-2 border-th-border">
          <EmptyState
            title="Dual Meter Readings Incomplete for This Period"
            description={
              errorMessage ||
              "Both a Room Sensor reading and a Hostel Meter reading covering the exact same billing period are required for comparison."
            }
            actionLabel="+ Enter Readings"
            onAction={() => navigate("/readings")}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Main Verdict Hero Card */}
          <Card
            className={`p-6 sm:p-8 rounded-3xl border shadow-card ${
              comparison.verdict === "Readings Match"
                ? "bg-th-matchBg border-th-matchBdr"
                : comparison.verdict === "Minor Variation"
                ? "bg-th-warnBg border-th-warnBdr"
                : "bg-th-errBg border-th-errBdr"
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-th-textSub">
                    Period Aligned: {comparison.billing_period_label} ({comparison.period_start} to {comparison.period_end})
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl sm:text-3xl font-black text-th-text tracking-tight">
                    {comparison.verdict}
                  </h2>
                  <Badge variant="status" statusType={comparison.verdict} size="md" />
                </div>
                <p className="mt-2 text-xs sm:text-sm text-th-textSub max-w-xl leading-relaxed">
                  {comparison.verdict === "Readings Match"
                    ? `The unit difference of ${Math.abs(comparison.difference_percent).toFixed(2)}% falls within the configured ±${comparison.tolerance_percent}% tolerance threshold.`
                    : comparison.verdict === "Minor Variation"
                    ? `The unit difference of ${Math.abs(comparison.difference_percent).toFixed(2)}% exceeds ±${comparison.tolerance_percent}% but remains below 2× tolerance. Common causes include reading time offsets or rounding; verify both meter timestamps and boundaries.`
                    : `A unit difference of ${Math.abs(comparison.difference_percent).toFixed(2)}% exceeds 2× the ±${comparison.tolerance_percent}% threshold. This difference does not automatically imply misuse or fraud — common technical causes include differing electrical circuit boundaries, manual transcription errors, or non-aligned reading dates.`}
                </p>
              </div>

              <div className="flex flex-col items-start md:items-end gap-1.5 bg-th-card p-4 rounded-2xl border border-th-border shadow-xs min-w-[170px]">
                <span className="text-xs font-semibold text-th-textMuted uppercase tracking-wider">
                  Difference in Units
                </span>
                <span className="text-2xl font-black text-th-text font-mono">
                  {comparison.difference_units > 0 ? "+" : ""}
                  {comparison.difference_units.toFixed(2)} kWh
                </span>
                <span className="text-xs font-bold text-th-textSub font-mono">
                  ({comparison.difference_percent > 0 ? "+" : ""}
                  {comparison.difference_percent.toFixed(2)}% · ₹{(comparison.room_bill - comparison.hostel_bill).toFixed(2)})
                </span>
              </div>
            </div>
          </Card>

          {/* Side-by-Side Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. Room Sensor Reading */}
            <Card className="border-t-4 border-t-th-accent">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>1. Room Sensor Reading</CardTitle>
                  <Badge variant="source" sourceType={comparison.room_reading_source} size="sm" />
                </div>
                <p className="text-xs text-th-textMuted mt-1">
                  Independent room sensor boundary (Room #{selectedRoom?.room_number})
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-baseline justify-between border-b border-th-borderSub pb-2.5">
                  <span className="text-th-textMuted font-medium">Starting → Ending Reading</span>
                  <span className="font-mono font-bold text-th-text">
                    {comparison.room_reading_start.toFixed(2)} → {comparison.room_reading_end.toFixed(2)} kWh
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-b border-th-borderSub pb-2.5">
                  <span className="text-th-textMuted font-medium">Consumption (End − Start)</span>
                  <span className="text-xl font-black text-th-text font-mono">
                    {comparison.room_units.toFixed(2)} <span className="text-xs font-normal">kWh</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-b border-th-borderSub pb-2.5">
                  <span className="text-th-textMuted font-medium">Date &amp; Time Recorded</span>
                  <span className="font-mono text-th-textSub">{formatDateTime(comparison.room_recorded_at)}</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="font-bold text-th-text">Calculated Bill (@ ₹{comparison.rate_per_unit.toFixed(2)})</span>
                  <span className="text-xl font-black text-th-accentText font-mono">
                    ₹{comparison.room_bill.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 2. Hostel Meter Reading */}
            <Card className="border-t-4 border-t-th-secBtn">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>2. Hostel Meter Reading</CardTitle>
                  <Badge variant="source" sourceType={comparison.hostel_reading_source} size="sm" />
                </div>
                <p className="text-xs text-th-textMuted mt-1">
                  Existing hostel meter used for billing
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-baseline justify-between border-b border-th-borderSub pb-2.5">
                  <span className="text-th-textMuted font-medium">Starting → Ending Reading</span>
                  <span className="font-mono font-bold text-th-text">
                    {comparison.hostel_reading_start != null && comparison.hostel_reading_end != null
                      ? `${comparison.hostel_reading_start.toFixed(2)} → ${comparison.hostel_reading_end.toFixed(2)} kWh`
                      : "Direct unit entry"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-b border-th-borderSub pb-2.5">
                  <span className="text-th-textMuted font-medium">Consumption (End − Start)</span>
                  <span className="text-xl font-black text-th-text font-mono">
                    {comparison.hostel_units.toFixed(2)} <span className="text-xs font-normal">kWh</span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-b border-th-borderSub pb-2.5">
                  <span className="text-th-textMuted font-medium">Date &amp; Time Recorded</span>
                  <span className="font-mono text-th-textSub">{formatDateTime(comparison.hostel_recorded_at)}</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="font-bold text-th-text">Hostel Billed Amount</span>
                  <span className="text-xl font-black text-th-text font-mono">
                    ₹{comparison.hostel_bill.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Measurement Boundary & Billing Period Alignment Explanation */}
          <Card className="bg-th-lavender border-th-lavenderBdr">
            <CardHeader className="border-th-lavenderBdr">
              <CardTitle>Electrical Boundary &amp; Billing Period Alignment Requirement</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-th-textSub leading-relaxed space-y-2">
              <p>
                For an accurate verification result, both the <strong>Room Sensor Reading</strong> and the{" "}
                <strong>Hostel Meter Reading</strong> must satisfy two technical prerequisites:
              </p>
              <ul className="list-disc ml-5 space-y-1">
                <li>
                  <strong>Same Electrical Boundary:</strong> Both meters must measure the exact same room circuit
                  loads (AC, fans, and lights inside Room #{selectedRoom?.room_number}). If common corridor lighting
                  or adjacent rooms share the hostel meter feed, natural unit differences will occur.
                </li>
                <li>
                  <strong>Same Billing Period:</strong> Both starting and ending readings must be captured across the
                  identical timeframe ({comparison.period_start} to {comparison.period_end}).
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Bottom Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-th-card rounded-2xl border border-th-border">
            <div>
              <p className="text-xs font-bold text-th-text">Need an official audit printout?</p>
              <p className="text-[11px] text-th-textMuted">
                Export the verification report preserving all source labels and dual meter readings.
              </p>
            </div>
            <Link to="/report">
              <Button variant="primary" size="sm">
                View &amp; Print Audit Report →
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
