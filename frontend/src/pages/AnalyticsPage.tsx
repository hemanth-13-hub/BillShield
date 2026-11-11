/**
 * AnalyticsPage — BillShield Electricity Analytics Module
 *
 * Interactive Recharts Line Graphs:
 *   1. Hourly electricity consumption    (via granularity switcher)
 *   2. Daily electricity consumption     (via granularity switcher)
 *   3. Weekly electricity consumption    (via granularity switcher)
 *   4. Monthly electricity consumption   (via granularity switcher)
 *   5. Cumulative Room Sensor vs Hostel Meter readings
 *   6. AC vs Non-AC average consumption comparison
 *
 * Every simulated series is explicitly tagged "SIMULATED DATA".
 * Actual physical sensor measurements are never fabricated.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useRoom } from "../context/RoomContext";
import { useToast } from "../components/ui/Toast";
import { api } from "../api/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Skeleton,
  EmptyState,
} from "../components/ui";
import { formatHostelType, formatRoomType } from "../constants/hostel";
import type {
  AggregateDataPoint,
  HostelMeterReading,
  RoomReading,
  RoomTypeComparisonResponse,
} from "../types/api";

// Consistent BillShield dashboard palette
const ROOM_BLUE = "#2563EB";
const HOSTEL_TEAL = "#0D9488";
const DIFF_AMBER = "#F59E0B";
const AC_BLUE = "#2563EB";
const NON_AC_GREEN = "#10B981";

type Granularity = "hourly" | "daily" | "weekly" | "monthly";

// ── Tooltip ───────────────────────────────────────────────────────────────────
interface TooltipPayloadItem {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  diffLabel?: string;
}

const AnalyticsTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label, diffLabel }) => {
  if (!active || !payload || payload.length === 0) return null;

  // Compute difference dynamically if both primary series exist in payload
  const values = payload.filter((p) => typeof p.value === "number");
  let diffDisplay: number | null = null;
  if (values.length >= 2 && values[0].value !== undefined && values[1].value !== undefined) {
    diffDisplay = values[0].value - values[1].value;
  }

  return (
    <div className="bg-navy-900 text-white rounded-2xl shadow-card px-4 py-3 text-xs min-w-[190px] border border-navy-700">
      <p className="font-bold text-slate-300 mb-2 text-[11px] uppercase tracking-wider truncate max-w-[210px]">
        {label}
      </p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-300 truncate max-w-[130px]">{entry.name}</span>
          </span>
          <span className="font-mono font-bold text-white">
            {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value} kWh
          </span>
        </div>
      ))}
      {diffDisplay !== null && (
        <div className="mt-1.5 pt-1.5 border-t border-navy-700 flex items-center justify-between gap-4 text-[11px]">
          <span className="text-amber-300 font-semibold">{diffLabel ?? "Difference"}</span>
          <span className="font-mono font-bold text-amber-300">
            {diffDisplay > 0 ? "+" : ""}
            {diffDisplay.toFixed(2)} kWh
          </span>
        </div>
      )}
    </div>
  );
};

// ── Simulated Data Indicator Pill ─────────────────────────────────────────────
const SimulatedBannerBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-400 text-[10px] font-extrabold uppercase tracking-wider">
    <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
    SIMULATED DATA
  </span>
);

function shortTickLabel(label: string, granularity: Granularity): string {
  if (granularity === "hourly") {
    // "2026-09-01 18:00" -> "09-01 18h"
    const parts = label.split(" ");
    if (parts.length === 2) {
      return `${parts[0].slice(5)} ${parts[1].slice(0, 2)}h`;
    }
    return label;
  }
  if (granularity === "daily") return label.slice(0, 6);
  if (granularity === "weekly") return label.split(" (")[0];
  return label.split(" ")[0];
}

export const AnalyticsPage: React.FC = () => {
  const { selectedRoomId, selectedRoom, billingPeriods } = useRoom();
  const { success, error: toastError } = useToast();

  // Granularity switcher: hourly | daily | weekly | monthly
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [dataPoints, setDataPoints] = useState<AggregateDataPoint[]>([]);
  const [chartNote, setChartNote] = useState<string>("");
  const [chartLoading, setChartLoading] = useState<boolean>(false);

  // Date filters for time-series analytics
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showDifferenceLine, setShowDifferenceLine] = useState<boolean>(true);

  // Raw room + hostel readings (powers Cumulative Graph)
  const [roomReadings, setRoomReadings] = useState<RoomReading[]>([]);
  const [hostelReadings, setHostelReadings] = useState<HostelMeterReading[]>([]);
  const [tableLoading, setTableLoading] = useState<boolean>(false);

  // AC vs Non-AC comparison data
  const [roomTypeComp, setRoomTypeComp] = useState<RoomTypeComparisonResponse | null>(null);
  const [roomTypeLoading, setRoomTypeLoading] = useState<boolean>(false);

  // Multi-month demo generator state
  const [isGeneratingDemo, setIsGeneratingDemo] = useState<boolean>(false);

  const activeRoomRef = useRef<number | null>(selectedRoomId);
  activeRoomRef.current = selectedRoomId;

  // ── Fetch aggregate time series ───────────────────────────────────────────
  const fetchAggregate = useCallback(async () => {
    const requestRoomId = selectedRoomId;
    setDataPoints([]);
    setChartNote("");
    if (!requestRoomId) return;
    setChartLoading(true);
    try {
      const res = await api.aggregate.get(requestRoomId, granularity);
      if (activeRoomRef.current === requestRoomId) {
        setDataPoints(res.data_points);
        setChartNote(res.note);
      }
    } catch (err) {
      console.error("Aggregate fetch error:", err);
      if (activeRoomRef.current === requestRoomId) setDataPoints([]);
    } finally {
      if (activeRoomRef.current === requestRoomId) setChartLoading(false);
    }
  }, [selectedRoomId, granularity]);

  // ── Fetch raw room & hostel readings ──────────────────────────────────────
  const fetchReadings = useCallback(async () => {
    const requestRoomId = selectedRoomId;
    setRoomReadings([]);
    setHostelReadings([]);
    if (!requestRoomId) return;
    setTableLoading(true);
    try {
      const [rr, hr] = await Promise.all([
        api.readings.list(requestRoomId),
        api.hostelMeter.list(requestRoomId),
      ]);
      if (activeRoomRef.current === requestRoomId) {
        setRoomReadings(rr);
        setHostelReadings(hr);
      }
    } catch (err) {
      console.error("Readings fetch error:", err);
    } finally {
      if (activeRoomRef.current === requestRoomId) setTableLoading(false);
    }
  }, [selectedRoomId]);

  // ── Fetch AC vs Non-AC comparison ─────────────────────────────────────────
  const fetchRoomTypeComparison = useCallback(async () => {
    setRoomTypeLoading(true);
    try {
      const data = await api.aggregate.roomTypeComparison();
      setRoomTypeComp(data);
    } catch (err) {
      console.error("AC vs Non-AC comparison fetch error:", err);
    } finally {
      setRoomTypeLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAggregate();
  }, [fetchAggregate]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  useEffect(() => {
    fetchRoomTypeComparison();
  }, [fetchRoomTypeComparison]);

  useEffect(() => {
    const handler = () => {
      fetchAggregate();
      fetchReadings();
      fetchRoomTypeComparison();
    };
    window.addEventListener("billshield:data-updated", handler);
    return () => window.removeEventListener("billshield:data-updated", handler);
  }, [fetchAggregate, fetchReadings, fetchRoomTypeComparison]);

  // Reset date range filters cleanly when switching rooms
  useEffect(() => {
    setDateFrom("");
    setDateTo("");
  }, [selectedRoomId]);

  // ── Generate Multi-Month Simulated Demo Dataset ───────────────────────────
  const handleGenerateMultiMonthDemo = async () => {
    if (!selectedRoomId || billingPeriods.length === 0) return;
    setIsGeneratingDemo(true);
    try {
      const sortedPeriods = [...billingPeriods].sort((a, b) =>
        a.period_start.localeCompare(b.period_start)
      );
      for (const bp of sortedPeriods) {
        await api.simulation.generate(selectedRoomId, {
          billing_period_id: bp.id,
          room_variance_percent: 5.0,
          hostel_variance_percent: 3.0,
        });
      }
      success(
        "SIMULATED DATA Generated",
        `Populated ${sortedPeriods.length} billing periods with clearly labelled SIMULATED sample readings.`
      );
      window.dispatchEvent(new CustomEvent("billshield:data-updated"));
    } catch (err: unknown) {
      toastError(
        "Demo Generation Failed",
        err instanceof Error ? err.message : "Could not generate simulated demo dataset."
      );
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  // ── Apply Date Filters to Time-Series Data ────────────────────────────────
  const filteredSeries = useMemo(() => {
    return dataPoints.filter((pt) => {
      if (dateFrom && pt.period_end < dateFrom) return false;
      if (dateTo && pt.period_start > dateTo) return false;
      return true;
    });
  }, [dataPoints, dateFrom, dateTo]);

  // Cap hourly display slice cleanly if massive multi-month hourly array, keeping latest/filtered window responsive
  const chartSeries = useMemo(() => {
    const base =
      granularity === "hourly" && filteredSeries.length > 72 && !dateFrom && !dateTo
        ? filteredSeries.slice(-72) // Last 3 days (72h) by default so hourly line graph stays crisp; date filter shows chosen dates
        : filteredSeries;

    return base.map((pt) => ({
      label: pt.label,
      roomKwh: pt.room_consumption,
      hostelKwh: pt.hostel_consumption ?? null,
      diffKwh:
        pt.difference_units !== null && pt.difference_units !== undefined
          ? pt.difference_units
          : pt.hostel_consumption != null
          ? Number((pt.room_consumption - pt.hostel_consumption).toFixed(3))
          : null,
      roomSource: pt.room_source,
      hostelSource: pt.hostel_source,
    }));
  }, [filteredSeries, granularity, dateFrom, dateTo]);

  const seriesHasSimulated = useMemo(() => {
    return filteredSeries.some(
      (pt) =>
        pt.room_source === "Simulated Demo Data" ||
        pt.hostel_source === "Simulated Demo Data"
    );
  }, [filteredSeries]);

  const roomSeriesTotal = useMemo(
    () => filteredSeries.reduce((s, p) => s + p.room_consumption, 0),
    [filteredSeries]
  );
  const hostelSeriesTotal = useMemo(
    () => filteredSeries.reduce((s, p) => s + (p.hostel_consumption ?? 0), 0),
    [filteredSeries]
  );
  const seriesDiffTotal = roomSeriesTotal - hostelSeriesTotal;

  // ── Cumulative Room Sensor vs Hostel Meter Series ─────────────────────────
  const cumulativeSeries = useMemo(() => {
    const sortedRoom = [...roomReadings].sort((a, b) =>
      a.billing_period.period_start.localeCompare(b.billing_period.period_start)
    );
    const hostelByPeriod = new Map<number, HostelMeterReading>();
    for (const hr of hostelReadings) hostelByPeriod.set(hr.billing_period_id, hr);

    let runningRoom = 0;
    let runningHostel = 0;

    return sortedRoom.map((rr) => {
      const hr = hostelByPeriod.get(rr.billing_period_id);
      runningRoom += rr.consumption;
      if (hr) runningHostel += hr.billed_units;
      return {
        label: rr.billing_period.label,
        roomCumulativeKwh: Number(runningRoom.toFixed(2)),
        hostelCumulativeKwh: hr ? Number(runningHostel.toFixed(2)) : null,
        roomMeterReadingEnd: rr.reading_end,
        hostelMeterReadingEnd: hr?.reading_end ?? null,
        cumulativeDiffKwh: hr ? Number((runningRoom - runningHostel).toFixed(2)) : null,
        isSimulated:
          rr.source === "Simulated Demo Data" || hr?.source === "Simulated Demo Data",
      };
    });
  }, [roomReadings, hostelReadings]);

  const cumulativeHasSimulated = cumulativeSeries.some((c) => c.isSimulated);

  const axisProps = {
    tick: { fontSize: 11, fill: "#64748B", fontFamily: "Inter, sans-serif" },
    axisLine: { stroke: "#CBD5E1" },
    tickLine: false as const,
  };

  const gridProps = {
    strokeDasharray: "3 3" as const,
    stroke: "#E2E8F0",
    vertical: false as const,
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Demo Dataset Action */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 dark:text-dark-text tracking-tight">
            Electricity Analytics
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-dark-muted mt-1">
            {selectedRoom
              ? `Room #${selectedRoom.room_number} (${formatRoomType(selectedRoom.room_type)}) · ${formatHostelType(selectedRoom.hostel_type)} · Block ${selectedRoom.block}`
              : "Select a room to view electricity graphs"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/history">
            <Button type="button" variant="secondary" size="sm">
              Reading History →
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={isGeneratingDemo}
            disabled={!selectedRoomId}
            onClick={handleGenerateMultiMonthDemo}
          >
            Load Multi-Month SIMULATED Demo
          </Button>
        </div>
      </div>

      {/* Prominent Demo & Sensor Integrity Notice */}
      <div
        role="note"
        className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div>
          <p className="font-extrabold uppercase tracking-wider text-amber-900 text-[11px]">
            Analytics Data Integrity · No Physical Sensor Fabricated
          </p>
          <p className="text-amber-900/90 mt-0.5 leading-relaxed">
            No real-time ESP32 sensor hardware is attached. Sample datasets generated for demonstration are
            explicitly labelled <strong>SIMULATED DATA</strong>, and hourly/daily/weekly curves represent
            interpolated estimates derived strictly from recorded billing period totals.
          </p>
        </div>
        <SimulatedBannerBadge />
      </div>

      {/* ── GRAPHS 1–4: Hourly / Daily / Weekly / Monthly Consumption Line Graph ── */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="capitalize">
                  {granularity} Electricity Consumption (kWh)
                </CardTitle>
                {seriesHasSimulated && <SimulatedBannerBadge />}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Room Sensor vs Hostel Meter trend lines with difference in kWh
              </p>
            </div>

            {/* Granularity Tab Switcher */}
            <div
              role="tablist"
              aria-label="Consumption chart granularity"
              className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-dark-border self-start lg:self-auto"
            >
              {(["hourly", "daily", "weekly", "monthly"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={granularity === g}
                  onClick={() => setGranularity(g)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors ${
                    granularity === g
                      ? "bg-white dark:bg-dark-card text-navy-900 dark:text-dark-text shadow-xs border border-slate-200 dark:border-dark-border"
                      : "text-slate-500 hover:text-navy-900 dark:hover:text-white"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Date Filters + Difference Line Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-dark-border text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <label htmlFor="analytics-date-from" className="font-semibold text-slate-500">
                  From:
                </label>
                <input
                  id="analytics-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-slate-200 dark:border-dark-border rounded-lg px-2.5 py-1 bg-white dark:bg-dark-card text-navy-900 dark:text-dark-text text-xs focus:ring-2 focus:ring-electric-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label htmlFor="analytics-date-to" className="font-semibold text-slate-500">
                  To:
                </label>
                <input
                  id="analytics-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border border-slate-200 dark:border-dark-border rounded-lg px-2.5 py-1 bg-white dark:bg-dark-card text-navy-900 dark:text-dark-text text-xs focus:ring-2 focus:ring-electric-500 focus:outline-none"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="text-xs font-bold text-electric-600 hover:underline px-2 py-1"
                >
                  Reset Dates
                </button>
              )}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={showDifferenceLine}
              onClick={() => setShowDifferenceLine((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-navy-900 dark:text-dark-text hover:bg-slate-100"
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: showDifferenceLine ? DIFF_AMBER : "#CBD5E1" }}
              />
              <span>{showDifferenceLine ? "Hide Difference Line" : "Show Difference Line"}</span>
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {chartNote && (
            <div className="p-3 bg-electric-50/70 dark:bg-electric-950/20 border border-electric-200 dark:border-electric-800 rounded-xl text-xs text-navy-900 dark:text-dark-muted">
              <strong>Methodology:</strong> {chartNote}
              {granularity === "hourly" && filteredSeries.length > 72 && !dateFrom && !dateTo && (
                <span> (Showing latest 72 hours; apply a date range filter above to inspect earlier dates.)</span>
              )}
            </div>
          )}

          {!selectedRoomId ? (
            <EmptyState
              title="No Room Selected"
              description="Select or register a room to inspect consumption analytics."
            />
          ) : chartLoading ? (
            <Skeleton variant="card" className="h-80" />
          ) : chartSeries.length === 0 ? (
            <EmptyState
              title="No Readings in Selected Range"
              description="Enter Room Sensor and Hostel Meter readings, adjust the date filter, or click 'Load Multi-Month SIMULATED Demo' above."
              actionLabel="Load SIMULATED Demo"
              onAction={handleGenerateMultiMonthDemo}
            />
          ) : (
            <>
              {/* Window Totals & Difference Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-dark-border">
                  <span className="text-slate-500 font-semibold block">Room Sensor (Filtered Window)</span>
                  <span className="text-lg font-black font-mono text-electric-600">
                    {roomSeriesTotal.toFixed(2)} kWh
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-dark-border">
                  <span className="text-slate-500 font-semibold block">Hostel Meter (Filtered Window)</span>
                  <span className="text-lg font-black font-mono text-teal-700">
                    {hostelSeriesTotal.toFixed(2)} kWh
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                  <span className="text-amber-900 font-semibold block">Difference (Room − Hostel)</span>
                  <span className="text-lg font-black font-mono text-amber-800">
                    {seriesDiffTotal > 0 ? "+" : ""}
                    {seriesDiffTotal.toFixed(2)} kWh
                  </span>
                </div>
              </div>

              <div className="w-full h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartSeries} margin={{ top: 12, right: 20, left: 6, bottom: 20 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis
                      dataKey="label"
                      tickFormatter={(v) => shortTickLabel(String(v), granularity)}
                      interval="preserveStartEnd"
                      minTickGap={22}
                      label={{
                        value: `${granularity.toUpperCase()} Timeline`,
                        position: "insideBottom",
                        offset: -12,
                        fontSize: 11,
                        fill: "#64748B",
                      }}
                      {...axisProps}
                    />
                    <YAxis
                      unit=" kWh"
                      width={68}
                      label={{
                        value: "Consumption (kWh)",
                        angle: -90,
                        position: "insideLeft",
                        fontSize: 11,
                        fill: "#64748B",
                      }}
                      {...axisProps}
                    />
                    <Tooltip content={<AnalyticsTooltip diffLabel="Difference (kWh)" />} />
                    <Legend verticalAlign="top" height={34} />

                    <Line
                      type="monotone"
                      dataKey="roomKwh"
                      name={seriesHasSimulated ? "Room Sensor (SIMULATED DATA)" : "Room Sensor (kWh)"}
                      stroke={ROOM_BLUE}
                      strokeWidth={2.5}
                      dot={granularity === "monthly" || granularity === "weekly"}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="hostelKwh"
                      name={seriesHasSimulated ? "Hostel Meter (SIMULATED DATA)" : "Hostel Meter (kWh)"}
                      stroke={HOSTEL_TEAL}
                      strokeWidth={2.5}
                      strokeDasharray="6 3"
                      dot={granularity === "monthly" || granularity === "weekly"}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                    {showDifferenceLine && (
                      <Line
                        type="monotone"
                        dataKey="diffKwh"
                        name="Difference (Room − Hostel kWh)"
                        stroke={DIFF_AMBER}
                        strokeWidth={2}
                        strokeDasharray="2 3"
                        dot={false}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── GRAPHS 5 & 6 Side-by-Side: Cumulative vs AC/Non-AC Comparison ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GRAPH 5: Cumulative Room Sensor vs Hostel Meter Readings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle>Cumulative Room Sensor vs Hostel Meter</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Running cumulative consumption (kWh) across billing periods
                </p>
              </div>
              {cumulativeHasSimulated && <SimulatedBannerBadge />}
            </div>
          </CardHeader>
          <CardContent>
            {tableLoading ? (
              <Skeleton variant="card" className="h-72" />
            ) : cumulativeSeries.length === 0 ? (
              <EmptyState
                title="No Cumulative Readings Yet"
                description="Add readings or load the SIMULATED demo dataset to track cumulative dual-meter alignment."
              />
            ) : (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulativeSeries} margin={{ top: 10, right: 16, left: 4, bottom: 20 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis
                      dataKey="label"
                      label={{
                        value: "Billing Period",
                        position: "insideBottom",
                        offset: -12,
                        fontSize: 11,
                        fill: "#64748B",
                      }}
                      {...axisProps}
                    />
                    <YAxis
                      unit=" kWh"
                      width={66}
                      label={{
                        value: "Cumulative kWh",
                        angle: -90,
                        position: "insideLeft",
                        fontSize: 11,
                        fill: "#64748B",
                      }}
                      {...axisProps}
                    />
                    <Tooltip content={<AnalyticsTooltip diffLabel="Cumulative Diff" />} />
                    <Legend verticalAlign="top" height={34} />

                    <Line
                      type="monotone"
                      dataKey="roomCumulativeKwh"
                      name={cumulativeHasSimulated ? "Room Cumulative (SIMULATED)" : "Room Sensor Cumulative"}
                      stroke={ROOM_BLUE}
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="hostelCumulativeKwh"
                      name={cumulativeHasSimulated ? "Hostel Cumulative (SIMULATED)" : "Hostel Meter Cumulative"}
                      stroke={HOSTEL_TEAL}
                      strokeWidth={2.5}
                      strokeDasharray="6 3"
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GRAPH 6: AC vs Non-AC Average Consumption Comparison */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle>AC vs Non-AC Average Consumption</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monthly average consumption comparison (kWh)
                </p>
              </div>
              {roomTypeComp?.is_simulated_demo && <SimulatedBannerBadge />}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {roomTypeLoading ? (
              <Skeleton variant="card" className="h-72" />
            ) : !roomTypeComp || roomTypeComp.points.length === 0 ? (
              <EmptyState
                title="No Category Comparison Available"
                description="Billing periods are required to compute AC vs Non-AC averages."
              />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-electric-50/70 border border-electric-200">
                    <span className="text-[10px] font-bold uppercase text-electric-800 block">AC Avg</span>
                    <span className="font-mono font-black text-navy-900">
                      {roomTypeComp.ac_overall_avg.toFixed(1)} kWh
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <span className="text-[10px] font-bold uppercase text-emerald-800 block">Non-AC Avg</span>
                    <span className="font-mono font-black text-navy-900">
                      {roomTypeComp.non_ac_overall_avg.toFixed(1)} kWh
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
                    <span className="text-[10px] font-bold uppercase text-amber-800 block">Difference</span>
                    <span className="font-mono font-black text-amber-900">
                      +{(roomTypeComp.ac_overall_avg - roomTypeComp.non_ac_overall_avg).toFixed(1)} kWh
                    </span>
                  </div>
                </div>

                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={roomTypeComp.points} margin={{ top: 10, right: 16, left: 4, bottom: 20 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis
                        dataKey="label"
                        tickFormatter={(v) => String(v).split(" ")[0]}
                        label={{
                          value: "Billing Period",
                          position: "insideBottom",
                          offset: -12,
                          fontSize: 11,
                          fill: "#64748B",
                        }}
                        {...axisProps}
                      />
                      <YAxis
                        unit=" kWh"
                        width={66}
                        label={{
                          value: "Average kWh",
                          angle: -90,
                          position: "insideLeft",
                          fontSize: 11,
                          fill: "#64748B",
                        }}
                        {...axisProps}
                      />
                      <Tooltip content={<AnalyticsTooltip diffLabel="AC − Non-AC Diff" />} />
                      <Legend verticalAlign="top" height={34} />

                      <Line
                        type="monotone"
                        dataKey="ac_avg_kwh"
                        name={roomTypeComp.is_simulated_demo ? "AC Room Avg (SIMULATED DATA)" : "AC Room Avg"}
                        stroke={AC_BLUE}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="non_ac_avg_kwh"
                        name={roomTypeComp.is_simulated_demo ? "Non-AC Room Avg (SIMULATED DATA)" : "Non-AC Room Avg"}
                        stroke={NON_AC_GREEN}
                        strokeWidth={2.5}
                        strokeDasharray="6 3"
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">{roomTypeComp.note}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
};
