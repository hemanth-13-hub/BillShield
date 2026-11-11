import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRoom } from "../context/RoomContext";
import { useToast } from "../components/ui/Toast";
import { api } from "../api/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Input,
  Modal,
  Skeleton,
  EmptyState,
} from "../components/ui";
import {
  ADITYA_BLOCKS,
  ADITYA_HOSTELS,
  AC_ROOM_SPECS,
  NON_AC_ROOM_SPECS,
  ROOMMATES_PER_ROOM,
  countInclusiveDays,
  formatHostelType,
  formatRoomType,
} from "../constants/hostel";
import type {
  Block,
  CompareResponse,
  HostelType,
  RoomReading,
  RoomType,
  Settings,
} from "../types/api";

export const RoomConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentStudent } = useAuth();
  const {
    rooms,
    selectedRoom,
    selectedRoomId,
    setSelectedRoomId,
    selectedPeriodId,
    billingPeriods,
    refreshRooms,
    refreshSelectedRoom,
  } = useRoom();
  const { success, error: toastError } = useToast();

  // Room-isolated readings & comparison state
  const [roomReadings, setRoomReadings] = useState<RoomReading[]>([]);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeRoomRef = useRef<number | null>(selectedRoomId);
  activeRoomRef.current = selectedRoomId;

  // Optional equal-share 3-roommate split toggle
  const [showEqualShare, setShowEqualShare] = useState<boolean>(true);

  // Room configuration modal state ("edit" updates active room, "create" adds an independent room)
  const [modalMode, setModalMode] = useState<"edit" | "create" | null>(null);
  const [editHostel, setEditHostel] = useState<HostelType>("boys");
  const [editBlock, setEditBlock] = useState<Block>("A");
  const [editRoomNumber, setEditRoomNumber] = useState<string>("");
  const [editRoomType, setEditRoomType] = useState<RoomType>("ac");
  const [editFloor, setEditFloor] = useState<string>("1");
  const [isSavingRoom, setIsSavingRoom] = useState<boolean>(false);

  const activePeriod = billingPeriods.find((bp) => bp.id === selectedPeriodId);

  // Load metrics strictly isolated to selectedRoomId (never mix across rooms)
  const loadRoomMetrics = useCallback(async () => {
    if (!selectedRoomId) {
      setRoomReadings([]);
      setComparison(null);
      setLoadError(null);
      return;
    }

    const requestRoomId = selectedRoomId;
    setRoomReadings([]);
    setComparison(null);
    setLoadError(null);
    setLoadingMetrics(true);

    try {
      const [readingsRes, settingsRes] = await Promise.all([
        api.readings.list(requestRoomId),
        api.settings.get(),
      ]);

      // Guard against stale async responses if room switched mid-flight
      if (activeRoomRef.current !== requestRoomId) return;

      setRoomReadings(readingsRes);
      setSettings(settingsRes);

      if (selectedPeriodId) {
        try {
          const comp = await api.compare.get(requestRoomId, selectedPeriodId);
          if (activeRoomRef.current === requestRoomId) setComparison(comp);
        } catch {
          if (activeRoomRef.current === requestRoomId) setComparison(null);
        }
      }
    } catch (err: unknown) {
      if (activeRoomRef.current === requestRoomId) {
        setLoadError(err instanceof Error ? err.message : "Failed to load room electricity metrics.");
      }
    } finally {
      if (activeRoomRef.current === requestRoomId) setLoadingMetrics(false);
    }
  }, [selectedRoomId, selectedPeriodId]);

  useEffect(() => {
    loadRoomMetrics();
    const handleUpdate = () => {
      refreshSelectedRoom();
      loadRoomMetrics();
    };
    window.addEventListener("billshield:data-updated", handleUpdate);
    return () => window.removeEventListener("billshield:data-updated", handleUpdate);
  }, [loadRoomMetrics, refreshSelectedRoom]);

  const openEditModal = () => {
    if (!selectedRoom) return;
    setEditHostel(selectedRoom.hostel_type);
    setEditBlock(selectedRoom.block);
    setEditRoomNumber(selectedRoom.room_number);
    setEditRoomType(selectedRoom.room_type);
    setEditFloor(String(selectedRoom.floor));
    setModalMode("edit");
  };

  const openCreateModal = () => {
    setEditHostel(selectedRoom?.hostel_type ?? "boys");
    setEditBlock(selectedRoom?.block ?? "A");
    setEditRoomNumber("");
    setEditRoomType("ac");
    setEditFloor("1");
    setModalMode("create");
  };

  const handleSaveRoomConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalMode) return;

    const cleanRoomNum = editRoomNumber.trim().toUpperCase();
    if (!cleanRoomNum) {
      toastError("Validation Error", "Room number is required.");
      return;
    }

    const parsedFloor = Math.max(0, Math.min(20, parseInt(editFloor, 10) || 1));

    setIsSavingRoom(true);
    try {
      if (modalMode === "create") {
        const created = await api.rooms.create({
          hostel_type: editHostel,
          block: editBlock,
          room_number: cleanRoomNum,
          room_type: editRoomType,
          floor: parsedFloor,
        });
        await refreshRooms();
        setSelectedRoomId(created.id);
        setModalMode(null);
        window.dispatchEvent(new CustomEvent("billshield:data-updated"));
        success(
          "New Room Added",
          `${formatHostelType(created.hostel_type)} · Block ${created.block} · Room ${created.room_number} (${formatRoomType(created.room_type)})`
        );
      } else {
        if (!selectedRoom) return;
        const updated = await api.rooms.update(selectedRoom.id, {
          hostel_type: editHostel,
          block: editBlock,
          room_number: cleanRoomNum,
          room_type: editRoomType,
          floor: parsedFloor,
        });
        await refreshRooms();
        await refreshSelectedRoom();
        setModalMode(null);
        window.dispatchEvent(new CustomEvent("billshield:data-updated"));
        success(
          "Room Configuration Saved",
          `${formatHostelType(updated.hostel_type)} · Block ${updated.block} · Room ${updated.room_number} (${formatRoomType(updated.room_type)})`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save room configuration.";
      toastError("Save Failed", msg);
    } finally {
      setIsSavingRoom(false);
    }
  };

  if (!selectedRoom) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="No Room Configured Yet"
          description="Register a student and room configuration to manage room appliances, roommates, and independent electricity records."
          actionLabel="Open Registration"
          onAction={() => navigate("/register")}
        />
      </div>
    );
  }

  const ratePerUnit = settings?.rate_per_unit ?? 10;
  const activePeriodReading =
    roomReadings.find((r) => r.billing_period_id === selectedPeriodId) ?? roomReadings[0] ?? null;

  const sharedConsumptionKwh = comparison
    ? comparison.room_units
    : activePeriodReading?.consumption ?? null;

  const sharedEstimatedCost = comparison
    ? comparison.room_bill
    : sharedConsumptionKwh !== null
    ? sharedConsumptionKwh * ratePerUnit
    : null;

  const periodDays = activePeriod
    ? countInclusiveDays(activePeriod.period_start, activePeriod.period_end)
    : 30;

  const totalDailyEstimateKwh = selectedRoom.appliances.reduce(
    (sum, app) => sum + (app.rated_watts * app.quantity * app.assumed_daily_hours) / 1000,
    0
  );

  // Build exactly 3 roommate slots per hostel specification
  const roommateSlots = Array.from({ length: ROOMMATES_PER_ROOM }, (_, idx) => {
    return selectedRoom.students[idx] ?? null;
  });

  return (
    <div className="space-y-6">
      {/* Header & Room Identity Card */}
      <div className="bg-navy-900 border border-navy-800 rounded-3xl p-6 sm:p-8 text-white shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-xs font-bold uppercase tracking-wider text-slate-200 border border-white/10">
              {formatHostelType(selectedRoom.hostel_type)}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-electric-600 text-xs font-bold uppercase tracking-wider text-white">
              Block {selectedRoom.block}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-white text-navy-900 text-xs font-extrabold uppercase tracking-wider">
              {formatRoomType(selectedRoom.room_type)} Room
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Room #{selectedRoom.room_number} Configuration
          </h1>

          <p className="text-xs sm:text-sm text-slate-300">
            Floor {selectedRoom.floor} · {selectedRoom.students.length} of {ROOMMATES_PER_ROOM} roommates registered ·{" "}
            {selectedRoom.appliances.length} configured appliance types
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={openEditModal}
            className="bg-navy-800 text-white hover:bg-navy-700 border border-navy-600"
          >
            Edit Room Configuration
          </Button>
          <Link to="/readings">
            <Button variant="primary" size="md">
              + Enter Room Readings
            </Button>
          </Link>
        </div>
      </div>

      {/* Room Data Isolation Notice */}
      <div
        role="note"
        className="p-4 rounded-2xl bg-electric-50 border border-electric-200 text-navy-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-start gap-2.5">
          <span className="font-bold text-electric-700" aria-hidden="true">🔒</span>
          <div>
            <p className="font-bold text-electric-900">
              Independent Room Electricity Ledger (Room ID #{selectedRoom.id})
            </p>
            <p className="text-slate-600 mt-0.5">
              All sub-meter readings, hostel meter records, and verification bills for{" "}
              <strong>{formatHostelType(selectedRoom.hostel_type)} · Block {selectedRoom.block} · Room {selectedRoom.room_number}</strong>{" "}
              are stored independently and never mixed with any other room.
            </p>
          </div>
        </div>
        <span className="font-mono font-bold text-[11px] px-2.5 py-1 rounded-lg bg-white border border-electric-200 text-electric-800 self-start sm:self-center whitespace-nowrap">
          {roomReadings.length} Recorded {roomReadings.length === 1 ? "Period" : "Periods"}
        </span>
      </div>

      {/* Shared Consumption & Optional Equal-Share Cost per Roommate */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Shared Room Consumption &amp; Per-Roommate Cost Estimate</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {activePeriod ? `Billing Period: ${activePeriod.label}` : "Latest recorded billing period"} · Rate ₹{ratePerUnit.toFixed(2)}/kWh
              </p>
            </div>

            {/* Optional Equal-Share Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={showEqualShare}
              onClick={() => setShowEqualShare((prev) => !prev)}
              className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-navy-900 dark:text-dark-text hover:bg-slate-100 transition-colors self-start sm:self-auto"
            >
              <span
                className={`w-9 h-5 rounded-full relative transition-colors inline-flex items-center px-0.5 ${
                  showEqualShare ? "bg-electric-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    showEqualShare ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </span>
              <span>Show Equal Share (÷ {ROOMMATES_PER_ROOM} roommates)</span>
            </button>
          </div>
        </CardHeader>

        <CardContent>
          {loadError ? (
            <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button type="button" variant="outline" size="sm" onClick={loadRoomMetrics}>
                Retry
              </Button>
            </div>
          ) : loadingMetrics ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Skeleton variant="card" className="h-24" />
              <Skeleton variant="card" className="h-24" />
              <Skeleton variant="card" className="h-24" />
              <Skeleton variant="card" className="h-24" />
            </div>
          ) : sharedConsumptionKwh === null || sharedEstimatedCost === null ? (
            <EmptyState
              title="No Electricity Reading for This Room Yet"
              description={`Record a sub-meter reading or simulate demo data for Room ${selectedRoom.room_number} to view shared consumption and equal-share roommate cost.`}
              actionLabel="+ Add Room Reading"
              onAction={() => navigate("/readings")}
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-dark-border">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Total Shared Room Usage
                  </span>
                  <p className="text-2xl font-black font-mono text-navy-900 dark:text-dark-text mt-1">
                    {sharedConsumptionKwh.toFixed(2)} <span className="text-xs font-semibold">kWh</span>
                  </p>
                  <div className="mt-2">
                    <Badge
                      variant="source"
                      sourceType={
                        comparison ? comparison.room_reading_source : activePeriodReading!.source
                      }
                      size="sm"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-dark-border">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Total Estimated Room Bill
                  </span>
                  <p className="text-2xl font-black font-mono text-electric-600 mt-1">
                    ₹{sharedEstimatedCost.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Computed at ₹{ratePerUnit.toFixed(2)}/kWh
                  </p>
                </div>

                {showEqualShare && (
                  <>
                    <div className="p-4 rounded-2xl bg-electric-50/70 dark:bg-electric-950/30 border border-electric-200 dark:border-electric-800">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-electric-800 dark:text-electric-400 block">
                        Optional Share / Roommate
                      </span>
                      <p className="text-2xl font-black font-mono text-navy-900 dark:text-dark-text mt-1">
                        {(sharedConsumptionKwh / ROOMMATES_PER_ROOM).toFixed(2)}{" "}
                        <span className="text-xs font-semibold">kWh</span>
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-dark-muted mt-1">
                        Equal split ÷ {ROOMMATES_PER_ROOM} roommates
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-electric-50/70 dark:bg-electric-950/30 border border-electric-200 dark:border-electric-800">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-electric-800 dark:text-electric-400 block">
                        Est. Cost / Roommate
                      </span>
                      <p className="text-2xl font-black font-mono text-electric-700 dark:text-electric-400 mt-1">
                        ₹{(sharedEstimatedCost / ROOMMATES_PER_ROOM).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-dark-muted mt-1">
                        Optional equal-share estimate
                      </p>
                    </div>
                  </>
                )}
              </div>

              {showEqualShare && (
                <p className="text-[11px] text-slate-500">
                  Note: Hostel room electricity is billed per shared room meter. The per-roommate figure is an
                  optional equal 3-way split estimate for personal budgeting.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Middle Grid: Roommates Roster (3 slots) & Appliance Configuration Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roommates Roster */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Roommates ({selectedRoom.students.length}/{ROOMMATES_PER_ROOM})</CardTitle>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Fixed 3 Beds
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Registered occupants sharing Room {selectedRoom.room_number}
            </p>
          </CardHeader>

          <CardContent className="space-y-3">
            {roommateSlots.map((student, idx) => {
              const isMe = student && currentStudent?.id === student.id;
              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                    student
                      ? isMe
                        ? "bg-electric-50/70 dark:bg-electric-950/30 border-electric-200 dark:border-electric-800"
                        : "bg-white dark:bg-dark-card border-slate-200 dark:border-dark-border"
                      : "bg-slate-50 dark:bg-slate-800/40 border-dashed border-slate-200 dark:border-dark-border"
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Roommate #{idx + 1} {isMe && "• You"}
                    </span>
                    {student ? (
                      <>
                        <p className="font-bold text-navy-900 dark:text-dark-text text-sm mt-0.5">
                          {student.name}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">{student.roll_number}</p>
                      </>
                    ) : (
                      <p className="text-slate-400 italic mt-0.5">Unoccupied demo slot</p>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      student
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {student ? "Assigned" : "Vacant"}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Appliance Configuration Table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle>
                  {formatRoomType(selectedRoom.room_type)} Room Appliance Configuration
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Standard fixed inventory for {formatHostelType(selectedRoom.hostel_type)} · Block {selectedRoom.block}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={openEditModal}>
                Change AC / Non-AC
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-dark-border text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Appliance</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Rated Power</th>
                    <th className="py-2.5 px-3 text-right">Assumed Use</th>
                    <th className="py-2.5 px-3 text-right">Est. Daily</th>
                    <th className="py-2.5 px-3 text-right">Est. ({periodDays}d Period)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-dark-border">
                  {selectedRoom.appliances.map((app) => {
                    const dailyKwh = (app.rated_watts * app.quantity * app.assumed_daily_hours) / 1000;
                    const periodKwh = dailyKwh * periodDays;
                    return (
                      <tr key={app.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3 font-bold text-navy-900 dark:text-dark-text">
                          {app.name}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">{app.quantity}</td>
                        <td className="py-3 px-3 text-right font-mono">{app.rated_watts} W</td>
                        <td className="py-3 px-3 text-right font-mono">{app.assumed_daily_hours} h/day</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          ~{dailyKwh.toFixed(2)} kWh
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-navy-900 dark:text-dark-text">
                          ~{periodKwh.toFixed(1)} kWh
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold">
                    <td colSpan={4} className="py-3 px-3 text-navy-900 dark:text-dark-text">
                      Total Theoretical Baseline (Estimate Only)
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-navy-900 dark:text-dark-text">
                      ~{totalDailyEstimateKwh.toFixed(2)} kWh
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-electric-600">
                      ~{(totalDailyEstimateKwh * periodDays).toFixed(1)} kWh
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <strong>Estimate Disclaimer:</strong> Wattage and daily hour figures provide a theoretical baseline estimate only and do not represent physical sensor measurements.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Reference Comparison + Independent Rooms Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Spec Reference */}
        <Card>
          <CardHeader>
            <CardTitle>Aditya University Room Categories</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Supported standard room hardware specifications
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div
              className={`p-4 rounded-xl border ${
                selectedRoom.room_type === "ac"
                  ? "border-electric-400 bg-electric-50/50 dark:bg-electric-950/20"
                  : "border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-800/40"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-navy-900 dark:text-dark-text">AC Room</h4>
                {selectedRoom.room_type === "ac" && (
                  <span className="text-[10px] font-bold text-electric-700 bg-white px-2 py-0.5 rounded-full border border-electric-200">
                    Active
                  </span>
                )}
              </div>
              <ul className="space-y-1 text-slate-600 dark:text-dark-muted">
                {AC_ROOM_SPECS.map((s) => (
                  <li key={s.name}>
                    • {s.quantity} {s.name}{s.quantity > 1 ? "s" : ""} ({s.ratedWatts}W)
                  </li>
                ))}
              </ul>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                selectedRoom.room_type === "non_ac"
                  ? "border-electric-400 bg-electric-50/50 dark:bg-electric-950/20"
                  : "border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-800/40"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-navy-900 dark:text-dark-text">Non-AC Room</h4>
                {selectedRoom.room_type === "non_ac" && (
                  <span className="text-[10px] font-bold text-electric-700 bg-white px-2 py-0.5 rounded-full border border-electric-200">
                    Active
                  </span>
                )}
              </div>
              <ul className="space-y-1 text-slate-600 dark:text-dark-muted">
                {NON_AC_ROOM_SPECS.map((s) => (
                  <li key={s.name}>
                    • {s.quantity} {s.name}{s.quantity > 1 ? "s" : ""} ({s.ratedWatts}W)
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Registered Rooms Isolation Directory */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Registered Rooms Directory ({rooms.length})</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Each room maintains isolated readings — select a row to inspect
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={openCreateModal}>
                + Add Room
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-dark-border text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-2 px-3">Hostel</th>
                    <th className="py-2 px-3">Block</th>
                    <th className="py-2 px-3">Room #</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3 text-right">Switch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-dark-border">
                  {rooms.map((rm) => {
                    const isActive = rm.id === selectedRoom.id;
                    return (
                      <tr
                        key={rm.id}
                        className={isActive ? "bg-electric-50/60 dark:bg-electric-950/20 font-semibold" : ""}
                      >
                        <td className="py-2.5 px-3 capitalize">{rm.hostel_type}</td>
                        <td className="py-2.5 px-3 font-bold">Block {rm.block}</td>
                        <td className="py-2.5 px-3 font-mono font-bold">#{rm.room_number}</td>
                        <td className="py-2.5 px-3">{formatRoomType(rm.room_type)}</td>
                        <td className="py-2.5 px-3 text-right">
                          {isActive ? (
                            <span className="text-[10px] font-bold text-electric-600 uppercase">Active</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectedRoomId(rm.id)}
                              className="text-xs font-bold text-electric-600 hover:underline"
                            >
                              View Room
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Independent Room Electricity Records Ledger Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle>
                Room #{selectedRoom.room_number} Independent Electricity Records
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatHostelType(selectedRoom.hostel_type)} · Block {selectedRoom.block} · Isolated strictly to Room ID #{selectedRoom.id}
              </p>
            </div>
            <Link to="/readings">
              <Button variant="outline" size="sm">+ Manage Readings</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {roomReadings.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No sub-meter readings recorded for Room #{selectedRoom.room_number} yet. Records entered for other rooms never appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-dark-border text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Billing Period</th>
                    <th className="py-2.5 px-3 text-right">Start kWh</th>
                    <th className="py-2.5 px-3 text-right">End kWh</th>
                    <th className="py-2.5 px-3 text-right">Shared Usage</th>
                    <th className="py-2.5 px-3 text-right">Est. Room Bill</th>
                    {showEqualShare && (
                      <th className="py-2.5 px-3 text-right">Equal Share (÷{ROOMMATES_PER_ROOM})</th>
                    )}
                    <th className="py-2.5 px-3">Source Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-dark-border">
                  {roomReadings.map((r) => {
                    const bill = r.consumption * ratePerUnit;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3 font-semibold text-navy-900 dark:text-dark-text">
                          {r.billing_period.label}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {r.reading_start.toFixed(1)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {r.reading_end.toFixed(1)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-navy-900 dark:text-dark-text">
                          {r.consumption.toFixed(2)} kWh
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-electric-600">
                          ₹{bill.toFixed(2)}
                        </td>
                        {showEqualShare && (
                          <td className="py-3 px-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                            ₹{(bill / ROOMMATES_PER_ROOM).toFixed(2)} / mate
                          </td>
                        )}
                        <td className="py-3 px-3">
                          <Badge variant="source" sourceType={r.source} size="sm" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit / Add Room Configuration Modal */}
      <Modal
        isOpen={modalMode !== null}
        onClose={() => !isSavingRoom && setModalMode(null)}
        title={modalMode === "create" ? "Add Independent Hostel Room" : "Edit Room Configuration"}
        description={
          modalMode === "create"
            ? "Creates a separate room ledger with standard AC / Non-AC appliances."
            : "Updates room details and automatically aligns standard AC / Non-AC appliances."
        }
        maxWidth="md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalMode(null)}
              disabled={isSavingRoom}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-room-config-form"
              variant="primary"
              size="sm"
              isLoading={isSavingRoom}
            >
              {modalMode === "create" ? "Create Room" : "Save Configuration"}
            </Button>
          </>
        }
      >
        <form id="edit-room-config-form" onSubmit={handleSaveRoomConfig} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-hostel-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Hostel Category
              </label>
              <select
                id="edit-hostel-select"
                value={editHostel}
                onChange={(e) => setEditHostel(e.target.value as HostelType)}
                className="w-full text-sm rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card text-navy-900 dark:text-dark-text py-2 px-3 focus:outline-none focus:ring-2 focus:ring-electric-500"
              >
                {ADITYA_HOSTELS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-block-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Block (A–G)
              </label>
              <select
                id="edit-block-select"
                value={editBlock}
                onChange={(e) => setEditBlock(e.target.value as Block)}
                className="w-full text-sm rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card text-navy-900 dark:text-dark-text py-2 px-3 focus:outline-none focus:ring-2 focus:ring-electric-500"
              >
                {ADITYA_BLOCKS.map((blk) => (
                  <option key={blk} value={blk}>
                    Block {blk}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Room Number"
              value={editRoomNumber}
              onChange={(e) => setEditRoomNumber(e.target.value.toUpperCase())}
              required
            />
            <Input
              label="Floor"
              type="number"
              min={0}
              max={20}
              value={editFloor}
              onChange={(e) => setEditFloor(e.target.value)}
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Room Category
            </span>
            <div className="grid grid-cols-2 gap-3">
              {(["ac", "non_ac"] as RoomType[]).map((rt) => (
                <button
                  key={rt}
                  type="button"
                  aria-pressed={editRoomType === rt}
                  onClick={() => setEditRoomType(rt)}
                  className={`p-3 rounded-xl border-2 text-left text-xs transition-colors ${
                    editRoomType === rt
                      ? "border-electric-600 bg-electric-50/70 dark:bg-electric-950/30 font-bold"
                      : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card"
                  }`}
                >
                  <p className="font-bold text-navy-900 dark:text-dark-text">{formatRoomType(rt)} Room</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {rt === "ac" ? "1 AC + 2 Fans + 4 Lights" : "2 Fans + 4 Lights"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

