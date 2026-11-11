import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useRoom } from "../../context/RoomContext";
import { useAuth } from "../../context/AuthContext";
import { useDarkMode } from "../../context/DarkModeContext";

export interface NavItem {
  to: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  badge?: string;
}

const navItems: NavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? "text-electric-400" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: "/room",
    label: "Room Config",
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? "text-electric-400" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    to: "/register",
    label: "Registration",
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? "text-electric-400" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    to: "/readings",
    label: "Dual Meter Entry",
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? "text-electric-400" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    to: "/compare",
    label: "Compare Meters",
    badge: "Dual Check",
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? "text-electric-400" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    to: "/analytics",
    label: "Analytics",
    badge: "6 Graphs",
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? "text-electric-400" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v12a1 1 0 001 1h14a1 1 0 001-1V4" />
      </svg>
    ),
  },
  {
    to: "/history",
    label: "Reading History",
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? "text-electric-400" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: "/report",
    label: "Audit Report (PDF)",
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? "text-electric-400" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Settings & Rates",
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? "text-electric-400" : "text-slate-400 group-hover:text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export const Sidebar: React.FC = () => {
  const { rooms, selectedRoomId, setSelectedRoomId, apiOnline } = useRoom();
  const { currentStudent } = useAuth();
  const { isDark, toggle: toggleDark } = useDarkMode();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile Top Bar with Hamburger */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-navy-900 border-b border-navy-800 z-40 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-electric-600 flex items-center justify-center text-white shadow-sm font-bold">
            ⚡
          </div>
          <span className="font-extrabold text-base tracking-tight text-white">
            Bill<span className="text-electric-400">Shield</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileOpen}
          className="p-2 text-slate-300 hover:text-white rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-electric-500"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            {isMobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-navy-900/80 z-40 backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Dark Navy Sidebar (Fixed on Desktop, Slide-over on Mobile) */}
      <aside
        aria-label="Primary navigation"
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-navy-900 border-r border-navy-800 flex flex-col transition-transform duration-200 ease-in-out ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand Header */}
        <div className="p-6 border-b border-navy-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-electric-600 flex items-center justify-center text-white shadow-sm font-black text-lg">
              ⚡
            </div>
            <div>
              <h1 className="font-extrabold text-lg tracking-tight text-white flex items-center gap-1.5">
                Bill<span className="text-electric-400">Shield</span>
              </h1>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                Aditya University
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            aria-label="Close sidebar"
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Room Quick Switcher Dropdown */}
        <div className="p-4 mx-4 my-4 rounded-xl bg-navy-800/60 border border-navy-700/60">
          <label htmlFor="sidebar-room-select" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Active Monitored Room
          </label>
          <select
            id="sidebar-room-select"
            value={selectedRoomId || ""}
            disabled={rooms.length === 0}
            onChange={(e) => setSelectedRoomId(e.target.value ? Number(e.target.value) : null)}
            className="w-full text-xs font-semibold bg-navy-900 text-white border border-navy-700 rounded-lg p-2 focus:ring-2 focus:ring-electric-500 focus:outline-none disabled:opacity-60"
          >
            {rooms.length === 0 ? (
              <option value="">No rooms yet — register first</option>
            ) : (
              rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.hostel_type === "boys" ? "Boys" : "Girls"} • Block {r.block} #{r.room_number} ({r.room_type === "ac" ? "AC" : "NON-AC"})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto" aria-label="Main routes">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsMobileOpen(false)}
              className={({ isActive }) =>
                `group flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-colors duration-150 ${
                  isActive
                    ? "bg-electric-600 text-white shadow-soft font-semibold"
                    : "text-slate-300 hover:bg-navy-800 hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3">
                    {item.icon(isActive)}
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-electric-950/60 text-electric-400 border border-electric-800"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Student Session & Footer info */}
        <div className="p-4 border-t border-navy-800 bg-navy-900/60 space-y-2">
          {currentStudent ? (
            <NavLink
              to="/register"
              onClick={() => setIsMobileOpen(false)}
              className="block p-2.5 rounded-xl bg-navy-800/80 border border-navy-700 hover:border-electric-500 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-electric-600/30 text-electric-400 border border-electric-500/40 flex items-center justify-center text-xs font-bold">
                  🎓
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{currentStudent.name}</p>
                  <p className="text-[10px] font-mono text-slate-400 truncate">{currentStudent.roll_number}</p>
                </div>
              </div>
            </NavLink>
          ) : (
            <NavLink
              to="/register"
              onClick={() => setIsMobileOpen(false)}
              className="block p-2 rounded-xl bg-navy-800/40 border border-dashed border-navy-700 text-center hover:bg-navy-800 transition-colors"
            >
              <span className="text-[11px] font-semibold text-electric-400">+ Register Student</span>
            </NavLink>
          )}

          <div className="p-2.5 rounded-xl bg-navy-800/40 border border-navy-800 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiOnline === false
                    ? "bg-rose-400"
                    : apiOnline === true
                    ? "bg-emerald-400"
                    : "bg-slate-400"
                }`}
              />
              <span className="text-slate-300 font-medium">
                {apiOnline === false ? "API Offline" : apiOnline === true ? "API Online" : "Connecting"}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleDark}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-navy-700 text-slate-300 hover:bg-navy-600 hover:text-white transition-colors"
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 110 10A5 5 0 0112 7z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              <span className="text-[10px] font-mono">{isDark ? "Light" : "Dark"}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile quick navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-navy-900 border-t border-navy-800 z-40 flex items-center justify-around px-2"
      >
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] transition-colors ${
                isActive ? "text-electric-400 font-bold" : "text-slate-400 hover:text-white"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {item.icon(isActive)}
                <span className="mt-1">{item.label.split(" ")[0]}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  );
};
