import React from "react";
import { useRoom } from "../../context/RoomContext";
import { useDarkMode } from "../../context/DarkModeContext";
import { Button } from "../ui/Button";

export interface HeaderProps {
  onSimulateClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onSimulateClick }) => {
  const { selectedRoom, billingPeriods, selectedPeriodId, setSelectedPeriodId, isLoading, apiOnline } = useRoom();
  const { isDark, toggle: toggleDark } = useDarkMode();

  return (
    <header className="sticky top-0 z-30 bg-th-surface/95 backdrop-blur-md border-b border-th-border px-4 sm:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs transition-colors duration-150">
      {/* Left: Active Room Info */}
      <div className="flex items-center gap-3 min-w-0">
        {selectedRoom ? (
          <>
            <div className="w-10 h-10 rounded-xl bg-th-accent text-th-onAccent flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
              {selectedRoom.block}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-th-text tracking-tight truncate">
                  Room {selectedRoom.room_number}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-th-lavender text-th-lavenderTxt border border-th-lavenderBdr">
                  {selectedRoom.room_type === "ac" ? "AC" : "NON-AC"}
                </span>
                <span className="text-xs text-th-textMuted capitalize">
                  ({selectedRoom.hostel_type} hostel)
                </span>
              </div>
              <p className="text-xs text-th-textSub font-medium truncate">
                Floor {selectedRoom.floor} • {selectedRoom.students.length} / 3 Roommates Registered
              </p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-th-textSub">
              {isLoading ? "Loading room context…" : "Complete registration to configure your hostel room"}
            </span>
          </div>
        )}
      </div>

      {/* Right: Period Selector & Quick Actions */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
        {/* Billing Period Dropdown */}
        <div className="flex items-center gap-1.5 bg-th-card border border-th-border rounded-xl px-2.5 py-1.5">
          <label htmlFor="header-period-select" className="text-xs font-semibold text-th-textMuted">
            Period:
          </label>
          <select
            id="header-period-select"
            value={selectedPeriodId || ""}
            onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
            className="text-xs font-bold text-th-text bg-transparent focus:outline-none cursor-pointer"
          >
            {billingPeriods.map((bp) => (
              <option key={bp.id} value={bp.id} className="bg-th-card text-th-text">
                {bp.label}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Demo Data Simulation Button */}
        {onSimulateClick && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSimulateClick}
            leftIcon={
              <svg className="w-3.5 h-3.5 text-th-accentText" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          >
            Simulate Demo Data
          </Button>
        )}

        {/* Theme Switcher Button */}
        <button
          type="button"
          onClick={toggleDark}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="p-2 rounded-xl border border-th-border bg-th-card text-th-textSub hover:bg-th-highlight hover:text-th-text transition-colors duration-150"
        >
          {isDark ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 110 10A5 5 0 0112 7z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* Live API Health Indicator */}
        <div
          className={`hidden md:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${
            apiOnline === false
              ? "bg-th-errBg border-th-errBdr text-th-errTxt"
              : apiOnline === true
              ? "bg-th-matchBg border-th-matchBdr text-th-matchTxt"
              : "bg-th-card border-th-border text-th-textMuted"
          }`}
          title="Backend REST API status"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              apiOnline === false
                ? "bg-th-errSolid"
                : apiOnline === true
                ? "bg-th-matchSolid"
                : "bg-th-textMuted"
            }`}
          />
          <span className="text-[11px] font-bold uppercase tracking-wider">
            {apiOnline === false ? "API Offline" : apiOnline === true ? "API Online" : "Connecting"}
          </span>
        </div>
      </div>
    </header>
  );
};
