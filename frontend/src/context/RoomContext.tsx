import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "./AuthContext";
import type { BillingPeriod, Room, RoomDetail } from "../types/api";

interface RoomContextType {
  rooms: Room[];
  selectedRoom: RoomDetail | null;
  selectedRoomId: number | null;
  setSelectedRoomId: (id: number | null) => void;
  billingPeriods: BillingPeriod[];
  selectedPeriodId: number | null;
  setSelectedPeriodId: (id: number) => void;
  isLoading: boolean;
  apiOnline: boolean | null;
  refreshRooms: () => Promise<Room[]>;
  refreshSelectedRoom: () => Promise<void>;
  refreshPeriods: () => Promise<void>;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentStudent } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(() => currentStudent?.room_id ?? null);
  const [selectedRoom, setSelectedRoom] = useState<RoomDetail | null>(null);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  // Sync active room when logged-in student changes
  useEffect(() => {
    if (currentStudent?.room_id) {
      setSelectedRoomId(currentStudent.room_id);
    }
  }, [currentStudent?.room_id]);

  const refreshRooms = useCallback(async (): Promise<Room[]> => {
    try {
      const data = await api.rooms.list();
      setRooms(data);
      setSelectedRoomId((prev) => {
        if (prev && data.some((r) => r.id === prev)) return prev;
        if (currentStudent?.room_id && data.some((r) => r.id === currentStudent.room_id)) {
          return currentStudent.room_id;
        }
        return data.length > 0 ? data[0].id : null;
      });
      return data;
    } catch (err) {
      console.error("Failed to load rooms:", err);
      return [];
    }
  }, [currentStudent?.room_id]);

  const refreshSelectedRoom = useCallback(async () => {
    if (!selectedRoomId) {
      setSelectedRoom(null);
      return;
    }
    try {
      const data = await api.rooms.get(selectedRoomId);
      setSelectedRoom(data);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) {
        setSelectedRoom(null);
        setSelectedRoomId(null);
      } else {
        console.error("Failed to load room details:", err);
      }
    }
  }, [selectedRoomId]);

  const refreshPeriods = useCallback(async () => {
    try {
      const data = await api.billingPeriods.list();
      setBillingPeriods(data);
      setSelectedPeriodId((prev) => {
        if (prev && data.some((bp) => bp.id === prev)) return prev;
        return data.length > 0 ? data[data.length - 1].id : null;
      });
    } catch (err) {
      console.error("Failed to load billing periods:", err);
    }
  }, []);

  // Load detailed room cleanly whenever selectedRoomId changes (reset first so rooms never mix)
  useEffect(() => {
    if (!selectedRoomId) {
      setSelectedRoom(null);
      return;
    }
    let isCurrent = true;
    setSelectedRoom(null);
    api.rooms
      .get(selectedRoomId)
      .then((data) => {
        if (isCurrent) setSelectedRoom(data);
      })
      .catch((err: unknown) => {
        if (isCurrent) {
          if (err instanceof ApiError && err.status === 404) {
            setSelectedRoom(null);
          } else {
            console.error("Failed to load room details:", err);
          }
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedRoomId]);

  useEffect(() => {
    api.health
      .check()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false));

    Promise.all([refreshRooms(), refreshPeriods()]).finally(() => {
      setIsLoading(false);
    });
  }, [refreshRooms, refreshPeriods]);

  return (
    <RoomContext.Provider
      value={{
        rooms,
        selectedRoom,
        selectedRoomId,
        setSelectedRoomId,
        billingPeriods,
        selectedPeriodId,
        setSelectedPeriodId,
        isLoading,
        apiOnline,
        refreshRooms,
        refreshSelectedRoom,
        refreshPeriods,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error("useRoom must be used within a RoomProvider");
  }
  return context;
};
