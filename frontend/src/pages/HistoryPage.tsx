/**
 * HistoryPage — BillShield Reading History & Record Management Module
 *
 * Maintains a persistent, per-room audit history of:
 *   - Room sensor starting & ending readings + calculated units
 *   - Hostel meter starting & ending readings + billed units
 *   - Billing period & reading timestamps
 *   - Electricity rate & bill amounts (Expected vs Hostel-reported)
 *   - Unit difference & verification status (exact backend parity)
 *
 * Features:
 *   - Search by billing period
 *   - Filter by reading source and meter presence
 *   - Sort by date, billing period, or unit difference
 *   - View detailed record modal with PDF export link
 *   - Edit entries with two-step explicit confirmation
 *   - Delete room / hostel / paired entries with confirmation
 *   - Strict room-specific data isolation
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { api } from "../api/client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Modal,
  Skeleton,
} from "../components/ui";
import { formatHostelType, formatRoomType } from "../constants/hostel";
import type {
  CompareResponse,
  HostelMeterReading,
  HostelMeterReadingUpdate,
  ReadingSource,
  RoomReading,
  RoomReadingUpdate,
  Settings,
  Verdict,
} from "../types/api";

type SortBy = "date" | "period" | "difference";
type SortDir = "asc" | "desc";
type StreamFilter = "all" | "paired" | "room_only" | "hostel_only";
type EditTargetType = "room" | "hostel";
type DeleteScope = "room" | "hostel" | "both";

interface HistoryPeriodRecord {
  periodId: number;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  room: RoomReading | null;
  hostel: HostelMeterReading | null;
  compare: CompareResponse | null;
  ratePerUnit: number;
  roomUnits: number | null;
  hostelUnits: number | null;
  roomBill: number | null;
  hostelBill: number | null;
  unitDifference: number | null;
  differencePercent: number | null;
  billDifference: number | null;
  verdict: Verdict | null;
  latestTimestamp: string;
  hasSimulated: boolean;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateTimeLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  return `₹${val.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedRoomId, selectedRoom } = useRoom();
  const { currentStudent } = useAuth();
  const { success, error: toastError } = useToast();

  // Room-scoped API state
  const [roomReadings, setRoomReadings] = useState<RoomReading[]>([]);
  const [hostelReadings, setHostelReadings] = useState<HostelMeterReading[]>([]);
  const [comparisons, setComparisons] = useState<Record<number, CompareResponse>>({});
  const [settings, setSettings] = useState<Settings>({
    id: 1,
    rate_per_unit: 10,
    tolerance_percent: 5,
    updated_at: "",
  });
  const [loading, setLoading] = useState<boolean>(false);

  // Search, filters, sorting
  const [searchPeriod, setSearchPeriod] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<ReadingSource | "all">("all");
  const [streamFilter, setStreamFilter] = useState<StreamFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Detail modal
  const [detailRecord, setDetailRecord] = useState<HistoryPeriodRecord | null>(null);

  // Edit modal + two-step confirmation
  const [editRecord, setEditRecord] = useState<HistoryPeriodRecord | null>(null);
  const [editTargetType, setEditTargetType] = useState<EditTargetType>("room");
  const [editStart, setEditStart] = useState<string>("");
  const [editEnd, setEditEnd] = useState<string>("");
  const [editBilledUnits, setEditBilledUnits] = useState<string>("");
  const [editBilledAmount, setEditBilledAmount] = useState<string>("");
  const [editRecordedAt, setEditRecordedAt] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editError, setEditError] = useState<string>("");
  const [editConfirmStep, setEditConfirmStep] = useState<boolean>(false);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Delete confirmation modal
  const [deleteRecord, setDeleteRecord] = useState<HistoryPeriodRecord | null>(null);
  const [deleteScope, setDeleteScope] = useState<DeleteScope>("both");
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // PDF download state
  const [downloadingPeriodId, setDownloadingPeriodId] = useState<number | null>(null);

  // Strictly prevent stale updates across room switches
  const activeRoomRef = useRef<number | null>(selectedRoomId);
  activeRoomRef.current = selectedRoomId;

  const fetchHistory = useCallback(async () => {
    const requestRoomId = selectedRoomId;
    setRoomReadings([]);
    setHostelReadings([]);
    setComparisons({});
    if (!requestRoomId) return;

    setLoading(true);
    try {
      const [rr, hr, liveSettings] = await Promise.all([
        api.readings.list(requestRoomId),
        api.hostelMeter.list(requestRoomId),
        api.settings.get(),
      ]);

      if (activeRoomRef.current !== requestRoomId) return;

      // Identify billing periods that have BOTH room and hostel readings for backend comparison
      const roomPeriodIds = new Set(rr.map((r) => r.billing_period_id));
      const pairedPeriodIds = Array.from(
        new Set(
          hr
            .map((h) => h.billing_period_id)
            .filter((pid) => roomPeriodIds.has(pid))
        )
      );

      const compEntries = await Promise.all(
        pairedPeriodIds.map(async (pid) => {
          try {
            const comp = await api.compare.get(requestRoomId, pid);
            return [pid, comp] as const;
          } catch {
            return null;
          }
        })
      );

      if (activeRoomRef.current !== requestRoomId) return;

      const compMap: Record<number, CompareResponse> = {};
      for (const entry of compEntries) {
        if (entry) compMap[entry[0]] = entry[1];
      }

      setRoomReadings(rr);
      setHostelReadings(hr);
      setSettings(liveSettings);
      setComparisons(compMap);
    } catch (err) {
      if (activeRoomRef.current === requestRoomId) {
        toastError(
          err instanceof Error
            ? `Failed to load reading history: ${err.message}`
            : "Failed to load reading history."
        );
      }
    } finally {
      if (activeRoomRef.current === requestRoomId) setLoading(false);
    }
  }, [selectedRoomId, toastError]);

  useEffect(() => {
    setDetailRecord(null);
    setEditRecord(null);
    setDeleteRecord(null);
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const handler = () => {
      fetchHistory();
    };
    window.addEventListener("billshield:data-updated", handler);
    return () => window.removeEventListener("billshield:data-updated", handler);
  }, [fetchHistory]);

  // ── Combine Room Sensor & Hostel Meter records per Billing Period ──────────
  const records = useMemo<HistoryPeriodRecord[]>(() => {
    const byPeriod = new Map<
      number,
      { room: RoomReading | null; hostel: HostelMeterReading | null }
    >();

    for (const r of roomReadings) {
      const curr = byPeriod.get(r.billing_period_id) ?? { room: null, hostel: null };
      curr.room = r;
      byPeriod.set(r.billing_period_id, curr);
    }
    for (const h of hostelReadings) {
      const curr = byPeriod.get(h.billing_period_id) ?? { room: null, hostel: null };
      curr.hostel = h;
      byPeriod.set(h.billing_period_id, curr);
    }

    const result: HistoryPeriodRecord[] = [];
    for (const [periodId, { room, hostel }] of byPeriod.entries()) {
      const bp = room?.billing_period ?? hostel?.billing_period;
      if (!bp) continue;

      const comp = comparisons[periodId] ?? null;
      const ratePerUnit = comp?.rate_per_unit ?? settings.rate_per_unit;
      const roomUnits = comp?.room_units ?? room?.consumption ?? null;
      const hostelUnits = comp?.hostel_units ?? hostel?.billed_units ?? null;
      const roomBill =
        comp?.room_bill ??
        (room ? Number((room.consumption * ratePerUnit).toFixed(2)) : null);
      const hostelBill = comp?.hostel_bill ?? hostel?.billed_amount ?? null;
      const unitDifference =
        comp?.difference_units ??
        (roomUnits !== null && hostelUnits !== null
          ? Number((roomUnits - hostelUnits).toFixed(2))
          : null);
      const billDifference =
        roomBill !== null && hostelBill !== null
          ? Number((roomBill - hostelBill).toFixed(2))
          : null;

      const roomTs = room?.recorded_at ?? "";
      const hostelTs = hostel?.recorded_at ?? "";
      const latestTimestamp = roomTs >= hostelTs ? roomTs : hostelTs;

      result.push({
        periodId,
        periodLabel: bp.label,
        periodStart: bp.period_start,
        periodEnd: bp.period_end,
        room,
        hostel,
        compare: comp,
        ratePerUnit,
        roomUnits,
        hostelUnits,
        roomBill,
        hostelBill,
        unitDifference,
        differencePercent: comp?.difference_percent ?? null,
        billDifference,
        verdict: comp?.verdict ?? null,
        latestTimestamp,
        hasSimulated:
          room?.source === "Simulated Demo Data" ||
          hostel?.source === "Simulated Demo Data",
      });
    }
    return result;
  }, [roomReadings, hostelReadings, comparisons, settings.rate_per_unit]);

  // ── Filter & Sort ──────────────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    const q = searchPeriod.trim().toLowerCase();
    return records.filter((rec) => {
      if (q) {
        const haystack = `${rec.periodLabel} ${rec.periodStart} ${rec.periodEnd} ${
          rec.room?.notes ?? ""
        } ${rec.hostel?.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (streamFilter === "paired" && !(rec.room && rec.hostel)) return false;
      if (streamFilter === "room_only" && !rec.room) return false;
      if (streamFilter === "hostel_only" && !rec.hostel) return false;

      if (sourceFilter !== "all") {
        const matchesRoom = rec.room?.source === sourceFilter;
        const matchesHostel = rec.hostel?.source === sourceFilter;
        if (!matchesRoom && !matchesHostel) return false;
      }

      return true;
    });
  }, [records, searchPeriod, streamFilter, sourceFilter]);

  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") {
        cmp = a.latestTimestamp.localeCompare(b.latestTimestamp);
      } else if (sortBy === "period") {
        cmp = a.periodEnd.localeCompare(b.periodEnd);
      } else if (sortBy === "difference") {
        const aDiff = a.unitDifference !== null ? Math.abs(a.unitDifference) : -1;
        const bDiff = b.unitDifference !== null ? Math.abs(b.unitDifference) : -1;
        cmp = aDiff - bDiff;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRecords, sortBy, sortDir]);

  // ── Open & populate Edit modal ─────────────────────────────────────────────
  const populateEditFields = (rec: HistoryPeriodRecord, target: EditTargetType) => {
    setEditTargetType(target);
    setEditError("");
    setEditConfirmStep(false);

    if (target === "room" && rec.room) {
      setEditStart(String(rec.room.reading_start));
      setEditEnd(String(rec.room.reading_end));
      setEditBilledUnits("");
      setEditBilledAmount("");
      setEditRecordedAt(toDateTimeLocalInput(rec.room.recorded_at));
      setEditNotes(rec.room.notes ?? "");
    } else if (target === "hostel" && rec.hostel) {
      setEditStart(
        rec.hostel.reading_start !== null && rec.hostel.reading_start !== undefined
          ? String(rec.hostel.reading_start)
          : ""
      );
      setEditEnd(
        rec.hostel.reading_end !== null && rec.hostel.reading_end !== undefined
          ? String(rec.hostel.reading_end)
          : ""
      );
      setEditBilledUnits(String(rec.hostel.billed_units));
      setEditBilledAmount(String(rec.hostel.billed_amount));
      setEditRecordedAt(toDateTimeLocalInput(rec.hostel.recorded_at));
      setEditNotes(rec.hostel.notes ?? "");
    }
  };

  const openEditModal = (rec: HistoryPeriodRecord, preferred?: EditTargetType) => {
    const initialTarget: EditTargetType =
      preferred && ((preferred === "room" && rec.room) || (preferred === "hostel" && rec.hostel))
        ? preferred
        : rec.room
        ? "room"
        : "hostel";
    setEditRecord(rec);
    populateEditFields(rec, initialTarget);
  };

  const editPreviewUnits = useMemo(() => {
    const s = parseFloat(editStart);
    const e = parseFloat(editEnd);
    if (editTargetType === "room") {
      if (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) {
        return Number((e - s).toFixed(2));
      }
      return null;
    }
    if (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) {
      return Number((e - s).toFixed(2));
    }
    const direct = parseFloat(editBilledUnits);
    return !Number.isNaN(direct) && direct >= 0 ? Number(direct.toFixed(2)) : null;
  }, [editStart, editEnd, editBilledUnits, editTargetType]);

  const validateAndProceedEdit = (e: React.FormEvent) => {
    e.preventDefault();
    setEditError("");
    if (!editRecord) return;

    if (editTargetType === "room") {
      const s = parseFloat(editStart);
      const endVal = parseFloat(editEnd);
      if (Number.isNaN(s) || Number.isNaN(endVal)) {
        setEditError("Both starting and ending meter readings are required.");
        return;
      }
      if (s < 0 || endVal < 0) {
        setEditError("Meter readings cannot be negative.");
        return;
      }
      if (endVal < s) {
        setEditError("Ending reading cannot be less than starting reading.");
        return;
      }
    } else {
      const hasStart = editStart.trim() !== "";
      const hasEnd = editEnd.trim() !== "";
      if (hasStart !== hasEnd) {
        setEditError("Provide both hostel starting and ending readings, or leave both blank and set billed units.");
        return;
      }
      if (hasStart && hasEnd) {
        const s = parseFloat(editStart);
        const endVal = parseFloat(editEnd);
        if (Number.isNaN(s) || Number.isNaN(endVal) || s < 0 || endVal < s) {
          setEditError("Hostel ending reading must be a non-negative number >= starting reading.");
          return;
        }
      } else {
        const unitsVal = parseFloat(editBilledUnits);
        if (Number.isNaN(unitsVal) || unitsVal < 0) {
          setEditError("Billed units must be zero or positive when meter start/end are omitted.");
          return;
        }
      }
    }

    setEditConfirmStep(true);
  };

  const confirmAndSaveEdit = async () => {
    if (!editRecord) return;
    setIsSavingEdit(true);
    setEditError("");

    const isoRecordedAt = editRecordedAt
      ? new Date(editRecordedAt).toISOString()
      : undefined;

    try {
      if (editTargetType === "room" && editRecord.room) {
        const payload: RoomReadingUpdate = {
          reading_start: parseFloat(editStart),
          reading_end: parseFloat(editEnd),
          recorded_at: isoRecordedAt,
          notes: editNotes.trim() || undefined,
        };
        await api.readings.update(editRecord.room.id, payload);
        success(
          `Updated Room Sensor entry for ${editRecord.periodLabel}.`
        );
      } else if (editTargetType === "hostel" && editRecord.hostel) {
        const hasMeterPair = editStart.trim() !== "" && editEnd.trim() !== "";
        const payload: HostelMeterReadingUpdate = {
          reading_start: hasMeterPair ? parseFloat(editStart) : undefined,
          reading_end: hasMeterPair ? parseFloat(editEnd) : undefined,
          billed_units: !hasMeterPair ? parseFloat(editBilledUnits) : undefined,
          billed_amount:
            editBilledAmount.trim() !== "" ? parseFloat(editBilledAmount) : undefined,
          recorded_at: isoRecordedAt,
          notes: editNotes.trim() || undefined,
        };
        await api.hostelMeter.update(editRecord.hostel.id, payload);
        success(
          `Updated Hostel Meter entry for ${editRecord.periodLabel}.`
        );
      }

      setEditRecord(null);
      setDetailRecord(null);
      await fetchHistory();
      window.dispatchEvent(new Event("billshield:data-updated"));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unable to update entry.";
      setEditError(msg);
      setEditConfirmStep(false);
      toastError(msg);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ── Open & execute Delete Confirmation ─────────────────────────────────────
  const openDeleteModal = (rec: HistoryPeriodRecord) => {
    const defaultScope: DeleteScope =
      rec.room && rec.hostel ? "both" : rec.room ? "room" : "hostel";
    setDeleteScope(defaultScope);
    setDeleteRecord(rec);
  };

  const confirmDelete = async () => {
    if (!deleteRecord) return;
    setIsDeleting(true);
    try {
      if ((deleteScope === "room" || deleteScope === "both") && deleteRecord.room) {
        await api.readings.delete(deleteRecord.room.id);
      }
      if ((deleteScope === "hostel" || deleteScope === "both") && deleteRecord.hostel) {
        await api.hostelMeter.delete(deleteRecord.hostel.id);
      }
      success(`Deleted selected record(s) for ${deleteRecord.periodLabel}.`);
      setDeleteRecord(null);
      setDetailRecord(null);
      await fetchHistory();
      window.dispatchEvent(new Event("billshield:data-updated"));
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Failed to delete reading entry."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Direct PDF Download helper for paired periods ──────────────────────────
  const handleDownloadPdf = async (rec: HistoryPeriodRecord) => {
    if (!selectedRoomId) return;
    setDownloadingPeriodId(rec.periodId);
    try {
      const url = api.report.pdfUrl(
        selectedRoomId,
        rec.periodId,
        currentStudent?.id,
        false
      );
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to generate PDF (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const roomSlug = (selectedRoom?.room_number || String(selectedRoomId)).replace(
        /\s+/g,
        "-"
      );
      const periodSlug = rec.periodLabel.replace(/\s+/g, "-");
      a.download = `BillShield-Verification-Room-${roomSlug}-${periodSlug}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
      success(`Downloaded verification PDF for ${rec.periodLabel}.`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "PDF download failed.");
    } finally {
      setDownloadingPeriodId(null);
    }
  };

  const pairedCount = records.filter((r) => r.room && r.hostel).length;
  const simulatedCount = records.filter((r) => r.hasSimulated).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-th-text tracking-tight">
            Reading History
          </h1>
          <p className="text-xs sm:text-sm text-th-textMuted mt-1">
            {selectedRoom
              ? `Room #${selectedRoom.room_number} (${formatRoomType(selectedRoom.room_type)}) · ${formatHostelType(selectedRoom.hostel_type)} · Block ${selectedRoom.block} — Isolated Room Audit Log`
              : "Select a room to view reading history"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/readings">
            <Button variant="primary" size="sm">
              + Enter Dual Readings
            </Button>
          </Link>
          <Link to="/analytics">
            <Button variant="outline" size="sm">
              Analytics Charts →
            </Button>
          </Link>
        </div>
      </div>

      {/* Room Separation & Source Transparency Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-th-card border border-th-border shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-wider text-th-textMuted">
            Billing Periods Logged
          </p>
          <p className="text-2xl font-extrabold text-th-text tabular-nums mt-1">
            {records.length}
          </p>
          <p className="text-[11px] text-th-textMuted mt-0.5">
            Exclusive to Room #{selectedRoom?.room_number ?? "—"}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-th-card border border-th-border shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-wider text-th-textMuted">
            Paired Dual Audits
          </p>
          <p className="text-2xl font-extrabold text-th-accentText tabular-nums mt-1">
            {pairedCount}
          </p>
          <p className="text-[11px] text-th-textMuted mt-0.5">
            Both Room Sensor &amp; Hostel Meter
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-th-card border border-th-border shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-wider text-th-textMuted">
            Active Tariff &amp; Tolerance
          </p>
          <p className="text-2xl font-extrabold text-th-text tabular-nums mt-1">
            ₹{settings.rate_per_unit.toFixed(2)}/kWh
          </p>
          <p className="text-[11px] text-th-textMuted mt-0.5">
            ±{settings.tolerance_percent}% match window
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-th-card border border-th-border shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-wider text-th-textMuted">
            Simulated Entries
          </p>
          <p className="text-2xl font-extrabold text-th-warnTxt tabular-nums mt-1">
            {simulatedCount}
          </p>
          <p className="text-[11px] text-th-textMuted mt-0.5">
            Clearly tagged SIMULATED DATA
          </p>
        </div>
      </div>

      {/* Main Filterable & Sortable Reading History Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div>
              <CardTitle>
                Reading History Log ({sortedRecords.length})
              </CardTitle>
              <p className="text-xs text-th-textMuted mt-0.5">
                Paired per billing period with start/end readings, calculated units, bill amounts, timestamps &amp; status
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 w-full xl:w-auto">
              <input
                type="search"
                aria-label="Search by billing period"
                placeholder="Search period (e.g. Oct 2026)..."
                value={searchPeriod}
                onChange={(e) => setSearchPeriod(e.target.value)}
                className="text-xs rounded-xl border border-th-border bg-th-bg text-th-text placeholder:text-th-textMuted px-3 py-2 focus:outline-none focus:border-th-accent"
              />

              <select
                aria-label="Filter by reading source"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as ReadingSource | "all")}
                className="text-xs font-semibold rounded-xl border border-th-border bg-th-bg text-th-text px-3 py-2 focus:outline-none focus:border-th-accent"
              >
                <option value="all" className="bg-th-card text-th-text">All Reading Sources</option>
                <option value="Manual Entry" className="bg-th-card text-th-text">Manual Entry</option>
                <option value="Simulated Demo Data" className="bg-th-card text-th-text">SIMULATED DATA</option>
                <option value="Sensor (Future)" className="bg-th-card text-th-text">Sensor (Future)</option>
              </select>

              <select
                aria-label="Filter by completeness"
                value={streamFilter}
                onChange={(e) => setStreamFilter(e.target.value as StreamFilter)}
                className="text-xs font-semibold rounded-xl border border-th-border bg-th-bg text-th-text px-3 py-2 focus:outline-none focus:border-th-accent"
              >
                <option value="all" className="bg-th-card text-th-text">All Records</option>
                <option value="paired" className="bg-th-card text-th-text">Paired Dual-Source Only</option>
                <option value="room_only" className="bg-th-card text-th-text">Has Room Sensor</option>
                <option value="hostel_only" className="bg-th-card text-th-text">Has Hostel Meter</option>
              </select>

              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Sort reading history"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="flex-1 text-xs font-semibold rounded-xl border border-th-border bg-th-bg text-th-text px-3 py-2 focus:outline-none focus:border-th-accent"
                >
                  <option value="date" className="bg-th-card text-th-text">Sort: Recorded Date</option>
                  <option value="period" className="bg-th-card text-th-text">Sort: Billing Period</option>
                  <option value="difference" className="bg-th-card text-th-text">Sort: Unit Difference</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                  title={sortDir === "desc" ? "Descending (newest/largest first)" : "Ascending"}
                  aria-label="Toggle sort order"
                  className="px-3 py-2 rounded-xl border border-th-border bg-th-bg text-xs font-bold text-th-text hover:bg-th-highlight transition-colors"
                >
                  {sortDir === "desc" ? "↓" : "↑"}
                </button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {!selectedRoomId ? (
            <EmptyState
              title="No room selected"
              description="Register or select a hostel room first to view its isolated reading history."
            />
          ) : loading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} variant="text" className="h-14" />
              ))}
            </div>
          ) : sortedRecords.length === 0 ? (
            <EmptyState
              title="No reading records match these filters"
              description={
                records.length === 0
                  ? `Room #${selectedRoom?.room_number ?? ""} has no recorded entries yet. Add readings or generate simulated demo data to get started.`
                  : "Try clearing your billing period search or switching source filters."
              }
              actionLabel={
                records.length === 0 ? "Go to Enter Readings" : "Clear Filters"
              }
              onAction={() => {
                if (records.length === 0) {
                  navigate("/readings");
                } else {
                  setSearchPeriod("");
                  setSourceFilter("all");
                  setStreamFilter("all");
                }
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-th-border text-[11px] font-bold uppercase tracking-wider text-th-textMuted">
                    <th className="py-3 pr-3">Billing Period</th>
                    <th className="py-3 px-3">Room Sensor (Start → End)</th>
                    <th className="py-3 px-3">Hostel Meter (Start → End)</th>
                    <th className="py-3 px-3">Rate &amp; Bills</th>
                    <th className="py-3 px-3">Unit Diff</th>
                    <th className="py-3 px-3">Timestamps</th>
                    <th className="py-3 px-3">Verification Status</th>
                    <th className="py-3 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-th-borderSub">
                  {sortedRecords.map((rec) => (
                    <tr
                      key={rec.periodId}
                      className="hover:bg-th-highlight/50 transition-colors align-top"
                    >
                      {/* Billing Period */}
                      <td className="py-3.5 pr-3 whitespace-nowrap">
                        <p className="font-bold text-th-text">
                          {rec.periodLabel}
                        </p>
                        <p className="text-[11px] text-th-textMuted mt-0.5 tabular-nums">
                          {rec.periodStart} → {rec.periodEnd}
                        </p>
                        {rec.hasSimulated && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-th-warnBg text-th-warnTxt border border-th-warnBdr text-[9px] font-extrabold uppercase tracking-wider">
                            SIMULATED DATA
                          </span>
                        )}
                      </td>

                      {/* Room Sensor */}
                      <td className="py-3.5 px-3 min-w-[170px]">
                        {rec.room ? (
                          <div className="space-y-1">
                            <p className="font-mono text-xs text-th-textSub tabular-nums">
                              {rec.room.reading_start.toFixed(2)} → {rec.room.reading_end.toFixed(2)}
                            </p>
                            <p className="font-extrabold text-th-accentText tabular-nums">
                              {rec.room.consumption.toFixed(2)} kWh
                            </p>
                            <Badge variant="source" sourceType={rec.room.source} size="sm" />
                          </div>
                        ) : (
                          <span className="text-xs italic text-th-textMuted">
                            Not entered
                          </span>
                        )}
                      </td>

                      {/* Hostel Meter */}
                      <td className="py-3.5 px-3 min-w-[170px]">
                        {rec.hostel ? (
                          <div className="space-y-1">
                            <p className="font-mono text-xs text-th-textSub tabular-nums">
                              {rec.hostel.reading_start != null && rec.hostel.reading_end != null
                                ? `${rec.hostel.reading_start.toFixed(2)} → ${rec.hostel.reading_end.toFixed(2)}`
                                : "Direct billed units"}
                            </p>
                            <p className="font-extrabold text-th-matchTxt tabular-nums">
                              {rec.hostel.billed_units.toFixed(2)} kWh
                            </p>
                            <Badge variant="source" sourceType={rec.hostel.source} size="sm" />
                          </div>
                        ) : (
                          <span className="text-xs italic text-th-textMuted">
                            Not entered
                          </span>
                        )}
                      </td>

                      {/* Rate & Bill Amounts */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-xs tabular-nums">
                        <p className="text-th-textMuted">
                          Rate: <span className="font-semibold text-th-text">₹{rec.ratePerUnit.toFixed(2)}/kWh</span>
                        </p>
                        <p className="mt-1">
                          Room: <span className="font-bold text-th-text">{formatCurrency(rec.roomBill)}</span>
                        </p>
                        <p>
                          Hostel: <span className="font-bold text-th-text">{formatCurrency(rec.hostelBill)}</span>
                        </p>
                      </td>

                      {/* Unit Difference */}
                      <td className="py-3.5 px-3 whitespace-nowrap tabular-nums">
                        {rec.unitDifference !== null ? (
                          <div>
                            <p className="font-extrabold text-th-text">
                              {rec.unitDifference > 0 ? "+" : ""}
                              {rec.unitDifference.toFixed(2)} kWh
                            </p>
                            {rec.differencePercent !== null && (
                              <p className="text-[11px] text-th-textMuted">
                                {rec.differencePercent.toFixed(1)}% variance
                              </p>
                            )}
                            {rec.billDifference !== null && (
                              <p className="text-[11px] text-th-textMuted">
                                {rec.billDifference > 0 ? "+" : ""}
                                {formatCurrency(rec.billDifference)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-th-textMuted">—</span>
                        )}
                      </td>

                      {/* Timestamps */}
                      <td className="py-3.5 px-3 text-[11px] text-th-textSub min-w-[165px]">
                        <p>
                          <span className="font-semibold text-th-textMuted">Room:</span>{" "}
                          {formatDateTime(rec.room?.recorded_at)}
                        </p>
                        <p className="mt-1">
                          <span className="font-semibold text-th-textMuted">Hostel:</span>{" "}
                          {formatDateTime(rec.hostel?.recorded_at)}
                        </p>
                      </td>

                      {/* Verification Status */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {rec.verdict ? (
                          <Badge variant="status" statusType={rec.verdict} size="sm" />
                        ) : (
                          <Badge variant="neutral" size="sm">
                            Pending Pair
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailRecord(rec)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-th-elevated hover:bg-th-highlight text-th-text transition-colors"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(rec)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-th-lavender hover:bg-th-highlight text-th-lavenderTxt border border-th-lavenderBdr transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteModal(rec)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-th-errBg hover:opacity-85 text-th-errTxt border border-th-errBdr transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Record Detail Modal ─────────────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(detailRecord)}
        onClose={() => setDetailRecord(null)}
        title={detailRecord ? `Record Details · ${detailRecord.periodLabel}` : undefined}
        description={
          selectedRoom
            ? `Aditya University · ${formatHostelType(selectedRoom.hostel_type)} · Block ${selectedRoom.block} · Room #${selectedRoom.room_number} (${formatRoomType(selectedRoom.room_type)})`
            : undefined
        }
        maxWidth="xl"
        footer={
          detailRecord ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDetailRecord(null)}>
                Close
              </Button>
              {detailRecord.room && detailRecord.hostel && (
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={downloadingPeriodId === detailRecord.periodId}
                  onClick={() => handleDownloadPdf(detailRecord)}
                >
                  Download Verification PDF
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openEditModal(detailRecord)}
              >
                Edit Entry
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => openDeleteModal(detailRecord)}
              >
                Delete
              </Button>
            </>
          ) : undefined
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            {/* Status & Watermark Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-th-surface border border-th-border">
              <div className="text-xs text-th-textSub">
                <span className="font-bold text-th-text">Billing Window:</span>{" "}
                {detailRecord.periodStart} to {detailRecord.periodEnd} ·{" "}
                <span className="font-semibold">Rate: ₹{detailRecord.ratePerUnit.toFixed(2)}/kWh</span>
              </div>
              <div className="flex items-center gap-2">
                {detailRecord.hasSimulated && (
                  <span className="px-2 py-0.5 rounded-full bg-th-warnBg text-th-warnTxt border border-th-warnBdr text-[10px] font-extrabold uppercase">
                    DEMO / SIMULATED DATA
                  </span>
                )}
                {detailRecord.verdict ? (
                  <Badge variant="status" statusType={detailRecord.verdict} size="sm" />
                ) : (
                  <Badge variant="neutral" size="sm">
                    Pending Pair
                  </Badge>
                )}
              </div>
            </div>

            {/* Dual Side-by-Side Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Room Sensor Card */}
              <div className="p-4 rounded-xl border border-th-lavenderBdr bg-th-lavender/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-th-lavenderTxt">
                    1. Room Sensor Reading
                  </h4>
                  {detailRecord.room && (
                    <Badge variant="source" sourceType={detailRecord.room.source} size="sm" />
                  )}
                </div>
                {detailRecord.room ? (
                  <dl className="grid grid-cols-2 gap-y-2 text-xs">
                    <dt className="text-th-textMuted">Starting Reading</dt>
                    <dd className="text-right font-mono font-semibold tabular-nums text-th-text">
                      {detailRecord.room.reading_start.toFixed(2)} kWh
                    </dd>
                    <dt className="text-th-textMuted">Ending Reading</dt>
                    <dd className="text-right font-mono font-semibold tabular-nums text-th-text">
                      {detailRecord.room.reading_end.toFixed(2)} kWh
                    </dd>
                    <dt className="text-th-textMuted">Calculated Units</dt>
                    <dd className="text-right font-extrabold text-th-accentText tabular-nums">
                      {detailRecord.room.consumption.toFixed(2)} kWh
                    </dd>
                    <dt className="text-th-textMuted">Expected Bill</dt>
                    <dd className="text-right font-bold tabular-nums text-th-text">
                      {formatCurrency(detailRecord.roomBill)}
                    </dd>
                    <dt className="text-th-textMuted">Timestamp</dt>
                    <dd className="text-right text-[11px] text-th-textSub">
                      {formatDateTime(detailRecord.room.recorded_at)}
                    </dd>
                    {detailRecord.room.notes && (
                      <>
                        <dt className="text-th-textMuted">Notes</dt>
                        <dd className="text-right text-[11px] text-th-textSub">
                          {detailRecord.room.notes}
                        </dd>
                      </>
                    )}
                  </dl>
                ) : (
                  <p className="text-xs italic text-th-textMuted py-4">
                    No Room Sensor reading recorded for this billing period.
                  </p>
                )}
              </div>

              {/* Hostel Meter Card */}
              <div className="p-4 rounded-xl border border-th-border bg-th-surface space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-th-matchTxt">
                    2. Hostel Meter Reading
                  </h4>
                  {detailRecord.hostel && (
                    <Badge variant="source" sourceType={detailRecord.hostel.source} size="sm" />
                  )}
                </div>
                {detailRecord.hostel ? (
                  <dl className="grid grid-cols-2 gap-y-2 text-xs">
                    <dt className="text-th-textMuted">Starting Reading</dt>
                    <dd className="text-right font-mono font-semibold tabular-nums text-th-text">
                      {detailRecord.hostel.reading_start != null
                        ? `${detailRecord.hostel.reading_start.toFixed(2)} kWh`
                        : "—"}
                    </dd>
                    <dt className="text-th-textMuted">Ending Reading</dt>
                    <dd className="text-right font-mono font-semibold tabular-nums text-th-text">
                      {detailRecord.hostel.reading_end != null
                        ? `${detailRecord.hostel.reading_end.toFixed(2)} kWh`
                        : "—"}
                    </dd>
                    <dt className="text-th-textMuted">Calculated Units</dt>
                    <dd className="text-right font-extrabold text-th-matchTxt tabular-nums">
                      {detailRecord.hostel.billed_units.toFixed(2)} kWh
                    </dd>
                    <dt className="text-th-textMuted">Hostel Bill Amount</dt>
                    <dd className="text-right font-bold tabular-nums text-th-text">
                      {formatCurrency(detailRecord.hostelBill)}
                    </dd>
                    <dt className="text-th-textMuted">Timestamp</dt>
                    <dd className="text-right text-[11px] text-th-textSub">
                      {formatDateTime(detailRecord.hostel.recorded_at)}
                    </dd>
                    {detailRecord.hostel.notes && (
                      <>
                        <dt className="text-th-textMuted">Notes</dt>
                        <dd className="text-right text-[11px] text-th-textSub">
                          {detailRecord.hostel.notes}
                        </dd>
                      </>
                    )}
                  </dl>
                ) : (
                  <p className="text-xs italic text-th-textMuted py-4">
                    No Hostel Meter reading recorded for this billing period.
                  </p>
                )}
              </div>
            </div>

            {/* Variance Summary & Disclaimer */}
            <div className="p-4 rounded-xl bg-th-surface border border-th-border text-xs space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 tabular-nums">
                <div>
                  <p className="text-th-textMuted text-[11px] uppercase font-bold">Unit Difference</p>
                  <p className="text-base font-extrabold text-th-text">
                    {detailRecord.unitDifference !== null
                      ? `${detailRecord.unitDifference > 0 ? "+" : ""}${detailRecord.unitDifference.toFixed(2)} kWh`
                      : "Pending Pair"}
                  </p>
                </div>
                <div>
                  <p className="text-th-textMuted text-[11px] uppercase font-bold">Relative Variance</p>
                  <p className="text-base font-extrabold text-th-text">
                    {detailRecord.differencePercent !== null
                      ? `${detailRecord.differencePercent.toFixed(1)}%`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-th-textMuted text-[11px] uppercase font-bold">Bill Delta (Room - Hostel)</p>
                  <p className="text-base font-extrabold text-th-text">
                    {detailRecord.billDifference !== null
                      ? `${detailRecord.billDifference > 0 ? "+" : ""}${formatCurrency(detailRecord.billDifference)}`
                      : "—"}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-th-textMuted leading-relaxed pt-2 border-t border-th-borderSub">
                Verification note: Differences indicate variance between two independent sources over the same billing
                window and do not automatically indicate fraud; boundary equipment (corridor/common lines or CT accuracy)
                must be inspected first.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Edit Entry Modal (with Two-Step Confirmation) ───────────────────── */}
      <Modal
        isOpen={Boolean(editRecord)}
        onClose={() => setEditRecord(null)}
        title={editRecord ? `Edit Entry · ${editRecord.periodLabel}` : undefined}
        description="Modify meter readings or timestamps. Source labels (e.g. SIMULATED DATA) remain audit-locked."
        maxWidth="lg"
      >
        {editRecord && (
          <form onSubmit={validateAndProceedEdit} className="space-y-4">
            {/* Switch between Room Sensor & Hostel Meter if both exist */}
            {editRecord.room && editRecord.hostel && (
              <div className="flex gap-2 p-1 rounded-xl bg-th-surface border border-th-border">
                {(["room", "hostel"] as EditTargetType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => populateEditFields(editRecord, t)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                      editTargetType === t
                        ? "bg-th-card text-th-text shadow-xs border border-th-border"
                        : "text-th-textMuted hover:text-th-text"
                    }`}
                  >
                    {t === "room" ? "1. Room Sensor Reading" : "2. Hostel Meter Reading"}
                  </button>
                ))}
              </div>
            )}

            {/* Locked Source Banner */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-th-surface border border-th-border text-xs">
              <span className="font-semibold text-th-textSub">
                Origin Tag (Immutable):
              </span>
              <Badge
                variant="source"
                sourceType={
                  editTargetType === "room"
                    ? editRecord.room?.source
                    : editRecord.hostel?.source
                }
                size="sm"
              />
            </div>

            {!editConfirmStep ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label={
                      editTargetType === "room"
                        ? "Room Start Reading (kWh)"
                        : "Hostel Start Reading (kWh)"
                    }
                    type="number"
                    step="0.01"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    required={editTargetType === "room"}
                  />
                  <Input
                    label={
                      editTargetType === "room"
                        ? "Room End Reading (kWh)"
                        : "Hostel End Reading (kWh)"
                    }
                    type="number"
                    step="0.01"
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                    required={editTargetType === "room"}
                  />
                </div>

                {editTargetType === "hostel" &&
                  (editStart.trim() === "" || editEnd.trim() === "") && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="Direct Billed Units (kWh)"
                        type="number"
                        step="0.01"
                        value={editBilledUnits}
                        onChange={(e) => setEditBilledUnits(e.target.value)}
                      />
                      <Input
                        label="Hostel Billed Amount (₹)"
                        type="number"
                        step="0.01"
                        value={editBilledAmount}
                        onChange={(e) => setEditBilledAmount(e.target.value)}
                      />
                    </div>
                  )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Recorded Timestamp"
                    type="datetime-local"
                    value={editRecordedAt}
                    onChange={(e) => setEditRecordedAt(e.target.value)}
                  />
                  <Input
                    label="Notes (Optional)"
                    type="text"
                    value={editNotes}
                    placeholder="Reason for adjustment..."
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>

                <div className="p-3 rounded-xl bg-th-highlight border border-th-border text-xs flex items-center justify-between">
                  <span className="text-th-textSub font-medium">
                    Recalculated Units Preview:
                  </span>
                  <span className="font-extrabold text-th-accentText tabular-nums">
                    {editPreviewUnits !== null
                      ? `${editPreviewUnits.toFixed(2)} kWh (${formatCurrency(
                          editPreviewUnits * settings.rate_per_unit
                        )})`
                      : "Invalid range"}
                  </span>
                </div>

                {editError && (
                  <p className="text-xs font-semibold text-th-errTxt bg-th-errBg border border-th-errBdr rounded-xl p-2.5">
                    {editError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditRecord(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm">
                    Review &amp; Confirm Update
                  </Button>
                </div>
              </>
            ) : (
              /* Step 2: Explicit Confirmation Panel */
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-th-warnBg border border-th-warnBdr text-th-warnTxt text-xs space-y-2">
                  <p className="font-extrabold uppercase tracking-wider text-[11px]">
                    Confirm Record Update
                  </p>
                  <p>
                    You are about to update the{" "}
                    <strong>
                      {editTargetType === "room" ? "Room Sensor" : "Hostel Meter"}
                    </strong>{" "}
                    entry for <strong>{editRecord.periodLabel}</strong> (Room #
                    {selectedRoom?.room_number}).
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 tabular-nums">
                    <li>
                      Meter Range:{" "}
                      <strong>
                        {editStart || "Direct"} → {editEnd || editBilledUnits} kWh
                      </strong>
                    </li>
                    <li>
                      Calculated Consumption:{" "}
                      <strong>
                        {editPreviewUnits !== null ? `${editPreviewUnits.toFixed(2)} kWh` : "—"}
                      </strong>
                    </li>
                    <li>
                      Timestamp:{" "}
                      <strong>{editRecordedAt ? editRecordedAt.replace("T", " ") : "Unchanged"}</strong>
                    </li>
                  </ul>
                </div>

                {editError && (
                  <p className="text-xs font-semibold text-th-errTxt bg-th-errBg border border-th-errBdr rounded-xl p-2.5">
                    {editError}
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditConfirmStep(false)}
                    disabled={isSavingEdit}
                  >
                    ← Back to Edit
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    isLoading={isSavingEdit}
                    onClick={confirmAndSaveEdit}
                  >
                    Confirm &amp; Save Changes
                  </Button>
                </div>
              </div>
            )}
          </form>
        )}
      </Modal>

      {/* ── Delete Confirmation Modal ───────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(deleteRecord)}
        onClose={() => setDeleteRecord(null)}
        title={deleteRecord ? `Delete Record · ${deleteRecord.periodLabel}` : undefined}
        description="This action permanently deletes the selected entry from the BillShield database for this room."
        maxWidth="md"
        footer={
          deleteRecord ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteRecord(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={isDeleting}
                onClick={confirmDelete}
              >
                Confirm Delete
              </Button>
            </>
          ) : undefined
        }
      >
        {deleteRecord && (
          <div className="space-y-3 text-xs">
            <p className="text-th-textSub">
              Room #{selectedRoom?.room_number} · Billing Period:{" "}
              <strong className="text-th-text">
                {deleteRecord.periodLabel}
              </strong>
            </p>

            {deleteRecord.room && deleteRecord.hostel ? (
              <div className="space-y-2">
                <p className="font-semibold text-th-text">
                  Select which entry to delete:
                </p>
                {(
                  [
                    {
                      value: "both",
                      label: `Both Paired Entries (${deleteRecord.room.consumption.toFixed(
                        2
                      )} kWh Room + ${deleteRecord.hostel.billed_units.toFixed(2)} kWh Hostel)`,
                    },
                    {
                      value: "room",
                      label: `Room Sensor Entry Only (${deleteRecord.room.consumption.toFixed(
                        2
                      )} kWh)`,
                    },
                    {
                      value: "hostel",
                      label: `Hostel Meter Entry Only (${deleteRecord.hostel.billed_units.toFixed(
                        2
                      )} kWh)`,
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                      deleteScope === opt.value
                        ? "border-th-errSolid bg-th-errBg"
                        : "border-th-border bg-th-card hover:bg-th-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="deleteScope"
                      checked={deleteScope === opt.value}
                      onChange={() => setDeleteScope(opt.value)}
                      className="text-th-errSolid"
                    />
                    <span className="font-medium text-th-text">
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-th-errBg border border-th-errBdr text-th-errTxt">
                Permanently removing the{" "}
                <strong>
                  {deleteRecord.room ? "Room Sensor" : "Hostel Meter"}
                </strong>{" "}
                entry for <strong>{deleteRecord.periodLabel}</strong>.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
