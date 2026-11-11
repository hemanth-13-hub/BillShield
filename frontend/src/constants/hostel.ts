import type { Block, HostelType, RoomType } from "../types/api";

export const ADITYA_HOSTELS: { value: HostelType; label: string; subtitle: string }[] = [
  { value: "boys",  label: "Boys Hostel",  subtitle: "Blocks A–G · AC & Non-AC rooms" },
  { value: "girls", label: "Girls Hostel", subtitle: "Blocks A–G · AC & Non-AC rooms" },
];

export const ADITYA_BLOCKS: Block[] = ["A", "B", "C", "D", "E", "F", "G"];

export const ROOMMATES_PER_ROOM = 3;

export interface StandardApplianceSpec {
  name: string;
  quantity: number;
  ratedWatts: number;
  assumedDailyHours: number;
}

export const AC_ROOM_SPECS: StandardApplianceSpec[] = [
  { name: "Air Conditioner", quantity: 1, ratedWatts: 1500, assumedDailyHours: 8 },
  { name: "Normal Fan",      quantity: 2, ratedWatts: 75,   assumedDailyHours: 12 },
  { name: "Tube Light",      quantity: 2, ratedWatts: 40,   assumedDailyHours: 8 },
  { name: "Washroom Light",  quantity: 1, ratedWatts: 15,   assumedDailyHours: 2 },
  { name: "Balcony Light",   quantity: 1, ratedWatts: 15,   assumedDailyHours: 3 },
];

export const NON_AC_ROOM_SPECS: StandardApplianceSpec[] = [
  { name: "Normal Fan",     quantity: 2, ratedWatts: 75, assumedDailyHours: 14 },
  { name: "Tube Light",     quantity: 2, ratedWatts: 40, assumedDailyHours: 8 },
  { name: "Washroom Light", quantity: 1, ratedWatts: 15, assumedDailyHours: 2 },
  { name: "Balcony Light",  quantity: 1, ratedWatts: 15, assumedDailyHours: 3 },
];

export function formatRoomType(roomType?: RoomType | string | null): string {
  if (!roomType) return "—";
  return roomType === "ac" ? "AC" : "Non-AC";
}

export function formatHostelType(hostelType?: HostelType | string | null): string {
  if (!hostelType) return "—";
  return hostelType === "boys" ? "Boys Hostel" : "Girls Hostel";
}

export function countInclusiveDays(startIso: string, endIso: string): number {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

