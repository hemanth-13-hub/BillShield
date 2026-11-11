import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import {
  ADITYA_BLOCKS,
  ADITYA_HOSTELS,
  AC_ROOM_SPECS,
  NON_AC_ROOM_SPECS,
  ROOMMATES_PER_ROOM,
  formatHostelType,
  formatRoomType,
} from "../constants/hostel";
import type { Block, HostelType, RoomDetail, RoomType } from "../types/api";

interface FormErrors {
  name?: string;
  rollNumber?: string;
  roomNumber?: string;
}

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { rooms, selectedRoom, setSelectedRoomId, refreshRooms, refreshSelectedRoom } = useRoom();
  const { currentStudent, login, logout } = useAuth();
  const { success, error: toastError } = useToast();

  // Form fields (zero assumed room numbers or invented student records)
  const [name, setName] = useState<string>(currentStudent?.name ?? "");
  const [rollNumber, setRollNumber] = useState<string>(currentStudent?.roll_number ?? "");
  const [hostelType, setHostelType] = useState<HostelType>("boys");
  const [selectedBlock, setSelectedBlock] = useState<Block>("A");
  const [roomNumber, setRoomNumber] = useState<string>("");
  const [roomType, setRoomType] = useState<RoomType>("ac");
  const [floor, setFloor] = useState<string>("1");

  const [errors, setErrors] = useState<FormErrors>({});
  const [matchedRoomDetail, setMatchedRoomDetail] = useState<RoomDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [initializedForEdit, setInitializedForEdit] = useState<boolean>(false);

  const isEditMode = currentStudent !== null;

  // When already registered, populate current student + room details once room loads
  useEffect(() => {
    if (!currentStudent) {
      setInitializedForEdit(false);
      return;
    }
    setName(currentStudent.name);
    setRollNumber(currentStudent.roll_number);

    if (selectedRoom && selectedRoom.id === currentStudent.room_id && !initializedForEdit) {
      setHostelType(selectedRoom.hostel_type);
      setSelectedBlock(selectedRoom.block);
      setRoomNumber(selectedRoom.room_number);
      setRoomType(selectedRoom.room_type);
      setFloor(String(selectedRoom.floor));
      setInitializedForEdit(true);
    } else if (!initializedForEdit) {
      const fallbackRoom = rooms.find((r) => r.id === currentStudent.room_id);
      if (fallbackRoom) {
        setHostelType(fallbackRoom.hostel_type);
        setSelectedBlock(fallbackRoom.block);
        setRoomNumber(fallbackRoom.room_number);
        setRoomType(fallbackRoom.room_type);
        setFloor(String(fallbackRoom.floor));
        setInitializedForEdit(true);
      }
    }
  }, [currentStudent, selectedRoom, rooms, initializedForEdit]);

  // Existing rooms already registered in DB for the currently selected Hostel + Block
  const roomsInBlock = rooms.filter(
    (r) => r.hostel_type === hostelType && r.block === selectedBlock
  );

  const normalizedRoomNum = roomNumber.trim().toUpperCase();
  const matchingExistingRoom = rooms.find(
    (r) =>
      r.hostel_type === hostelType &&
      r.block === selectedBlock &&
      r.room_number.toUpperCase() === normalizedRoomNum
  );

  // Fetch roommate count when user types/selects a room that already exists in DB
  useEffect(() => {
    if (!matchingExistingRoom) {
      setMatchedRoomDetail(null);
      return;
    }
    let isCurrent = true;
    api.rooms
      .get(matchingExistingRoom.id)
      .then((detail) => {
        if (isCurrent) setMatchedRoomDetail(detail);
      })
      .catch(() => {
        if (isCurrent) setMatchedRoomDetail(null);
      });
    return () => {
      isCurrent = false;
    };
  }, [matchingExistingRoom?.id]);

  const activeSpecs = roomType === "ac" ? AC_ROOM_SPECS : NON_AC_ROOM_SPECS;

  const validate = (): boolean => {
    const nextErrors: FormErrors = {};
    const trimmedName = name.trim();
    const trimmedRoll = rollNumber.trim().toUpperCase();
    const trimmedRoom = roomNumber.trim().toUpperCase();

    if (!trimmedName) {
      nextErrors.name = "Student full name is required.";
    } else if (trimmedName.length < 2) {
      nextErrors.name = "Full name must be at least 2 characters.";
    }

    if (!trimmedRoll) {
      nextErrors.rollNumber = "University roll number is required.";
    } else if (!/^[A-Z0-9-]{3,20}$/.test(trimmedRoll)) {
      nextErrors.rollNumber = "Use 3–20 alphanumeric characters (e.g., 22AUB101).";
    }

    if (!trimmedRoom) {
      nextErrors.roomNumber = "Room number is required.";
    } else if (!/^[A-Z0-9-]{1,10}$/.test(trimmedRoom)) {
      nextErrors.roomNumber = "Enter a valid room number (1–10 letters/numbers).";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const cleanName = name.trim();
    const cleanRoll = rollNumber.trim().toUpperCase();
    const cleanRoomNum = roomNumber.trim().toUpperCase();
    const parsedFloor = Math.max(0, Math.min(20, parseInt(floor, 10) || 1));

    setIsSubmitting(true);
    try {
      if (isEditMode && currentStudent) {
        // Edit existing demo student & room allocation
        let targetRoomId = currentStudent.room_id;
        const currentRoomDetail =
          selectedRoom?.id === currentStudent.room_id
            ? selectedRoom
            : await api.rooms.get(currentStudent.room_id);

        const existingTarget = rooms.find(
          (r) =>
            r.hostel_type === hostelType &&
            r.block === selectedBlock &&
            r.room_number.toUpperCase() === cleanRoomNum
        );

        if (existingTarget) {
          targetRoomId = existingTarget.id;
          if (existingTarget.id !== currentStudent.room_id) {
            const targetDetail = await api.rooms.get(existingTarget.id);
            if (targetDetail.students.length >= ROOMMATES_PER_ROOM) {
              toastError(
                "Room Full",
                `Room ${cleanRoomNum} in Block ${selectedBlock} already has ${ROOMMATES_PER_ROOM}/${ROOMMATES_PER_ROOM} roommates.`
              );
              setIsSubmitting(false);
              return;
            }
          }
          if (existingTarget.room_type !== roomType || existingTarget.floor !== parsedFloor) {
            await api.rooms.update(existingTarget.id, {
              room_type: roomType,
              floor: parsedFloor,
            });
          }
        } else if (currentRoomDetail.students.length <= 1) {
          // Only occupant in current room — update room record in-place to keep its readings
          await api.rooms.update(currentRoomDetail.id, {
            hostel_type: hostelType,
            block: selectedBlock,
            room_number: cleanRoomNum,
            room_type: roomType,
            floor: parsedFloor,
          });
          targetRoomId = currentRoomDetail.id;
        } else {
          // Roommates share old room — create target room and move student
          const createdRoom = await api.rooms.create({
            hostel_type: hostelType,
            block: selectedBlock,
            room_number: cleanRoomNum,
            room_type: roomType,
            floor: parsedFloor,
          });
          targetRoomId = createdRoom.id;
        }

        const updatedStudent = await api.students.update(currentStudent.id, {
          name: cleanName,
          roll_number: cleanRoll,
          room_id: targetRoomId,
        });

        login(updatedStudent);
        await refreshRooms();
        setSelectedRoomId(targetRoomId);
        await refreshSelectedRoom();
        window.dispatchEvent(new CustomEvent("billshield:data-updated"));

        success(
          "Details Updated",
          `${formatHostelType(hostelType)} · Block ${selectedBlock} · Room ${cleanRoomNum} (${formatRoomType(roomType)})`
        );
        navigate("/");
      } else {
        // Fresh registration flow
        let targetRoomId: number;

        if (matchingExistingRoom) {
          const detail = matchedRoomDetail ?? (await api.rooms.get(matchingExistingRoom.id));
          if (detail.students.length >= ROOMMATES_PER_ROOM) {
            toastError(
              "Room Full",
              `Room ${cleanRoomNum} already has ${ROOMMATES_PER_ROOM}/${ROOMMATES_PER_ROOM} roommates registered.`
            );
            setIsSubmitting(false);
            return;
          }
          // If room exists and has mismatched category, update if requested or keep clear
          if (detail.room_type !== roomType && detail.students.length === 0) {
            await api.rooms.update(detail.id, { room_type: roomType });
          }
          targetRoomId = detail.id;
        } else {
          const createdRoom = await api.rooms.create({
            hostel_type: hostelType,
            block: selectedBlock,
            room_number: cleanRoomNum,
            room_type: roomType,
            floor: parsedFloor,
          });
          targetRoomId = createdRoom.id;
        }

        const registered = await api.students.register({
          room_id: targetRoomId,
          name: cleanName,
          roll_number: cleanRoll,
        });

        login(registered);
        await refreshRooms();
        setSelectedRoomId(targetRoomId);
        window.dispatchEvent(new CustomEvent("billshield:data-updated"));

        success(
          "Registration Complete",
          `Welcome, ${registered.name}! Opening dashboard for Room ${cleanRoomNum}.`
        );
        navigate("/");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save registration details.";
      toastError("Registration Error", msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartFreshDemo = () => {
    logout();
    setInitializedForEdit(false);
    setName("");
    setRollNumber("");
    setRoomNumber("");
    setHostelType("boys");
    setSelectedBlock("A");
    setRoomType("ac");
    setFloor("1");
    setErrors({});
    success("Demo Session Cleared", "You can now register a new demo student.");
  };

  const isTargetRoomFull =
    matchedRoomDetail !== null &&
    matchedRoomDetail.id !== currentStudent?.room_id &&
    matchedRoomDetail.students.length >= ROOMMATES_PER_ROOM;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Mandatory Demo Disclaimer Banner */}
      <div
        role="note"
        className="p-4 rounded-2xl bg-electric-50 border border-electric-200 text-navy-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <span className="text-lg flex-shrink-0" aria-hidden="true">ℹ️</span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-electric-800">
              Project Demonstration Notice — Not Official University Authentication
            </p>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              This onboarding screen is part of the BillShield Aditya University student mini-project demo.
              No real university credentials or official hostel databases are queried; student and room records
              are stored strictly for demo electricity bill verification.
            </p>
          </div>
        </div>
        {isEditMode && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleStartFreshDemo}
            className="flex-shrink-0"
          >
            Register Another Student
          </Button>
        )}
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 dark:text-dark-text tracking-tight">
            {isEditMode ? "Edit Student & Room Details" : "Student Room Registration"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-dark-muted mt-1">
            {isEditMode
              ? "Update your demo profile or change your Aditya University hostel, block, room number, and AC configuration."
              : "Enter your student identity and Aditya University hostel room configuration to open your personalized dashboard."}
          </p>
        </div>
        {isEditMode && (
          <Button type="button" variant="outline" size="sm" onClick={() => navigate("/")}>
            ← Back to Dashboard
          </Button>
        )}
      </div>

      {/* Main Registration Form + Live Summary Grid */}
      <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 columns: All 6 Required Inputs */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {isEditMode ? "Student & Hostel Allocation Form" : "Complete All Required Details"}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Aditya University Structure · Boys &amp; Girls Hostels · Blocks A–G · AC &amp; Non-AC · {ROOMMATES_PER_ROOM} roommates per room
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* 1 & 2. Student Identity */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                1. Student Identity
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Student Full Name *"
                  placeholder="Enter your full name"
                  value={name}
                  error={errors.name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                  }}
                  required
                />
                <Input
                  label="University Roll Number *"
                  placeholder="Enter roll number (e.g. 22AUB101)"
                  value={rollNumber}
                  error={errors.rollNumber}
                  onChange={(e) => {
                    setRollNumber(e.target.value.toUpperCase());
                    if (errors.rollNumber) setErrors((p) => ({ ...p, rollNumber: undefined }));
                  }}
                  helperText="Alphanumeric roll ID stored locally for demo reports"
                  required
                />
              </div>
            </div>

            {/* 3. Hostel Category */}
            <div className="space-y-2.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                2. Hostel Category *
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ADITYA_HOSTELS.map((h) => {
                  const selected = hostelType === h.value;
                  return (
                    <button
                      key={h.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setHostelType(h.value)}
                      className={`p-4 rounded-2xl border-2 text-left transition-colors flex items-center justify-between ${
                        selected
                          ? "border-electric-600 bg-electric-50/70 dark:bg-electric-950/30"
                          : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card hover:border-slate-300"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold text-navy-900 dark:text-dark-text">{h.label}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{h.subtitle}</p>
                      </div>
                      <span
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          selected ? "border-electric-600 bg-electric-600" : "border-slate-300"
                        }`}
                      >
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Block (A–G) */}
            <div className="space-y-2.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                3. Block (A – G) *
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5">
                {ADITYA_BLOCKS.map((blk) => {
                  const selected = selectedBlock === blk;
                  return (
                    <button
                      key={blk}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedBlock(blk)}
                      className={`py-3 rounded-xl border-2 font-bold transition-colors flex flex-col items-center justify-center ${
                        selected
                          ? "border-electric-600 bg-navy-900 text-white shadow-sm"
                          : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card text-navy-900 dark:text-dark-text hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-base font-extrabold">{blk}</span>
                      <span className={`text-[10px] ${selected ? "text-slate-300" : "text-slate-400"}`}>
                        Block {blk}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5 & 6. Room Number & Room Type */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                4. Room Number &amp; Room Type *
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    label="Room Number *"
                    placeholder="Enter your room number"
                    value={roomNumber}
                    error={errors.roomNumber}
                    onChange={(e) => {
                      setRoomNumber(e.target.value.toUpperCase());
                      if (errors.roomNumber) setErrors((p) => ({ ...p, roomNumber: undefined }));
                    }}
                    helperText="Enter your actual hostel room number — never assumed"
                    required
                  />
                </div>

                <Input
                  label="Floor"
                  type="number"
                  min={0}
                  max={20}
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  helperText="Optional (default 1)"
                />
              </div>

              {/* Existing rooms quick-join chips (only rooms already created by demo users) */}
              {roomsInBlock.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-dark-border space-y-2">
                  <p className="text-[11px] font-semibold text-slate-500">
                    Previously registered rooms in {formatHostelType(hostelType)} · Block {selectedBlock} (click to select):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {roomsInBlock.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setRoomNumber(r.room_number);
                          setRoomType(r.room_type);
                          setFloor(String(r.floor));
                          setErrors((p) => ({ ...p, roomNumber: undefined }));
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                          normalizedRoomNum === r.room_number.toUpperCase()
                            ? "bg-electric-600 text-white border-electric-600"
                            : "bg-white dark:bg-dark-card text-navy-900 dark:text-dark-text border-slate-200 hover:border-electric-400"
                        }`}
                      >
                        Room {r.room_number} ({formatRoomType(r.room_type)})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Room Type Cards: AC vs Non-AC */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={roomType === "ac"}
                  onClick={() => setRoomType("ac")}
                  className={`p-4 rounded-2xl border-2 text-left transition-colors ${
                    roomType === "ac"
                      ? "border-electric-600 bg-electric-50/70 dark:bg-electric-950/30"
                      : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-navy-900 dark:text-dark-text">AC Room</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-electric-100 text-electric-800">
                      With Air Conditioner
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    1 AC, 2 Normal Fans, 2 Tube Lights, 1 Washroom Light, 1 Balcony Light
                  </p>
                </button>

                <button
                  type="button"
                  aria-pressed={roomType === "non_ac"}
                  onClick={() => setRoomType("non_ac")}
                  className={`p-4 rounded-2xl border-2 text-left transition-colors ${
                    roomType === "non_ac"
                      ? "border-electric-600 bg-electric-50/70 dark:bg-electric-950/30"
                      : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-navy-900 dark:text-dark-text">Non-AC Room</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      Standard Ventilation
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    2 Normal Fans, 2 Tube Lights, 1 Washroom Light, 1 Balcony Light
                  </p>
                </button>
              </div>
            </div>

            {isTargetRoomFull && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium"
              >
                Room {normalizedRoomNum} in Block {selectedBlock} already has {ROOMMATES_PER_ROOM}/{ROOMMATES_PER_ROOM} roommates registered. Please enter another room number.
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-dark-border">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                disabled={isTargetRoomFull}
                className="w-full sm:w-auto"
              >
                {isEditMode ? "Save Updated Room Details" : "Complete Registration & Open Dashboard →"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right column: Live Selected Room Summary & Structure Preview */}
        <div className="space-y-6">
          <Card className="bg-navy-900 text-white border-navy-800">
            <CardHeader className="border-navy-800">
              <CardTitle className="text-white">Selected Room Summary</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">Live allocation preview</p>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2.5 border-b border-navy-800">
                <span className="text-slate-400">Student</span>
                <span className="font-bold text-white truncate max-w-[160px]">
                  {name.trim() || "Not entered"}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-navy-800">
                <span className="text-slate-400">Roll Number</span>
                <span className="font-mono font-bold text-electric-400">
                  {rollNumber.trim().toUpperCase() || "—"}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-navy-800">
                <span className="text-slate-400">Hostel Category</span>
                <span className="font-bold text-white">{formatHostelType(hostelType)}</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-navy-800">
                <span className="text-slate-400">Block</span>
                <span className="font-bold text-white">Block {selectedBlock}</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-navy-800">
                <span className="text-slate-400">Room Number</span>
                <span className="font-mono font-bold text-white">
                  {normalizedRoomNum ? `#${normalizedRoomNum}` : "Not entered"}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-navy-800">
                <span className="text-slate-400">Room Type</span>
                <span className="px-2 py-0.5 rounded-full bg-electric-600 text-white font-bold text-[11px]">
                  {formatRoomType(roomType)} Room
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Roommates</span>
                <span className="font-bold text-slate-200">
                  {matchedRoomDetail
                    ? `${matchedRoomDetail.students.length} / ${ROOMMATES_PER_ROOM} Registered`
                    : `Max ${ROOMMATES_PER_ROOM} per room`}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Appliance Configuration Preview */}
          <Card>
            <CardHeader>
              <CardTitle>{formatRoomType(roomType)} Appliance Profile</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Auto-configured for your room category
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeSpecs.map((spec) => (
                <div
                  key={spec.name}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-dark-border text-xs"
                >
                  <span className="font-semibold text-navy-900 dark:text-dark-text">{spec.name}</span>
                  <span className="font-mono text-slate-500">
                    {spec.quantity} × {spec.ratedWatts}W
                  </span>
                </div>
              ))}
              <p className="text-[11px] text-slate-400 pt-1">
                Every room maintains completely independent meter records and never mixes readings with other rooms.
              </p>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
};
