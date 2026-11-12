/**
 * ReportPage — Printable / PDF Electricity Verification Certificate
 *
 * Renders a formal audit document containing:
 *   • Student & room details (hostel, block, room number, floor, occupants)
 *   • Billing period with exact start and end dates
 *   • Both meter readings (room sub-meter and official hostel meter)
 *   • Difference in kWh and %, bill for each
 *   • Verdict badge with tolerance threshold
 *   • Appliance theoretical estimate table (labelled ESTIMATE ONLY)
 *   • Full data-source statement — simulated data clearly marked
 *   • Signature block
 *
 * NON-NEGOTIABLE: Every simulated reading is flagged with a mandatory
 * "⚠️ Simulated Demo Data" statement in the report header.
 * Simulated data is NEVER presented as physical sensor measurements.
 *
 * PDF export: FastAPI ReportLab PDF endpoint (/api/v1/rooms/{id}/report/pdf) + window.print() fallback.
 */

import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRoom } from "../context/RoomContext";
import { useToast } from "../components/ui/Toast";
import { api } from "../api/client";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { countInclusiveDays } from "../constants/hostel";
import type { CompareResponse } from "../types/api";

/** Format ISO date as "DD Month YYYY" for the report header */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** Report reference number e.g. BS-GIRLS-B-101-2 */
function reportRef(roomId: number, periodId: number, block: string, hostel: string): string {
  return `BS-${hostel.toUpperCase().slice(0, 1)}-${block}-${roomId}-${periodId}`;
}

export const ReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentStudent } = useAuth();
  const { selectedRoom, selectedRoomId, selectedPeriodId, billingPeriods } = useRoom();
  const { success, error: toastError } = useToast();
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const activePeriod = billingPeriods.find((p) => p.id === selectedPeriodId);

  useEffect(() => {
    setComparison(null);
    setError(null);
    if (!selectedRoomId || !selectedPeriodId) return;
    let isCurrent = true;
    setLoading(true);
    api.compare
      .get(selectedRoomId, selectedPeriodId)
      .then((data) => {
        if (isCurrent) setComparison(data);
      })
      .catch((err: unknown) => {
        if (isCurrent) {
          setComparison(null);
          setError(err instanceof Error ? err.message : "Failed to load comparison data.");
        }
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedRoomId, selectedPeriodId]);

  /* ── Derived flags ─────────────────────────────────────────────────── */
  const isRoomSim    = comparison?.room_reading_source === "Simulated Demo Data";
  const isHostelSim  = comparison?.hostel_reading_source === "Simulated Demo Data";
  const hasSimulated = isRoomSim || isHostelSim;

  /* ── Appliance monthly estimate ────────────────────────────────────── */
  const periodDays = activePeriod
    ? countInclusiveDays(activePeriod.period_start, activePeriod.period_end)
    : 30;

  const totalEstimateKwh = selectedRoom?.appliances.reduce(
    (sum, app) => sum + (app.rated_watts * app.quantity * app.assumed_daily_hours * periodDays) / 1000,
    0
  ) ?? 0;

  const verdictBoxClass =
    comparison?.verdict === "Readings Match"
      ? "bg-th-matchBg border-th-matchBdr"
      : comparison?.verdict === "Minor Variation"
      ? "bg-th-warnBg border-th-warnBdr"
      : "bg-th-errBg border-th-errBdr";

  const handleDownloadOfficialPdf = async () => {
    if (!selectedRoomId || !selectedPeriodId) return;
    setIsDownloadingPdf(true);
    try {
      const url = api.report.pdfUrl(
        selectedRoomId,
        selectedPeriodId,
        currentStudent?.id,
        false
      );
      const res = await fetch(url);
      if (!res.ok) {
        let message = `PDF generation failed (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) message = String(errJson.detail);
        } catch {
          // ignore JSON parse failure on non-JSON error
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const roomSlug = (selectedRoom?.room_number ?? String(selectedRoomId)).replace(
        /\s+/g,
        "-"
      );
      const periodSlug = (activePeriod?.label ?? `Period-${selectedPeriodId}`).replace(
        /\s+/g,
        "-"
      );
      anchor.href = objectUrl;
      anchor.download = `BillShield-Verification-Room-${roomSlug}-${periodSlug}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      success("Official BillShield verification PDF downloaded.");
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Could not download PDF report."
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handlePreviewPdfInNewTab = () => {
    if (!selectedRoomId || !selectedPeriodId) return;
    const url = api.report.pdfUrl(
      selectedRoomId,
      selectedPeriodId,
      currentStudent?.id,
      true
    );
    window.open(url, "_blank", "noopener,noreferrer");
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* ── Action bar (screen only) ──────────────────────────────── */}
      <div className="print:hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-th-card rounded-2xl border border-th-border shadow-soft">
        <div>
          <h2 className="text-sm font-bold text-th-text">
            Official Electricity Verification Audit Document
          </h2>
          <p className="text-xs text-th-textMuted mt-0.5">
            Download the FastAPI-generated verification PDF (with consumption graph &amp; watermark when applicable) or print this sheet.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/compare">
            <Button variant="ghost" size="sm">← Compare</Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            disabled={!comparison}
            onClick={handlePreviewPdfInNewTab}
            aria-label="Preview generated PDF report in a new browser tab"
          >
            Preview PDF
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!comparison}
            onClick={() => window.print()}
            aria-label="Open print dialog for report preview"
          >
            🖨️ Print Sheet
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={isDownloadingPdf}
            disabled={!comparison}
            onClick={handleDownloadOfficialPdf}
            aria-label="Download official BillShield verification PDF"
          >
            Download Official PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton variant="card" className="h-48" />
          <Skeleton variant="card" className="h-64" />
        </div>
      ) : !selectedRoomId || !selectedPeriodId ? (
        <EmptyState
          title="Select a Room & Billing Period"
          description="Choose a room and period from the sidebar / header, then return here to generate the report."
          actionLabel="Go to Dashboard"
          onAction={() => navigate("/")}
        />
      ) : (
        /* ── Printable Report Sheet ─────────────────────────────────── */
        <div
          id="billshield-report"
          className="bg-th-card rounded-3xl border border-th-border p-8 sm:p-12 shadow-card print:shadow-none print:border-none print:rounded-none print:p-0 space-y-8"
        >
          {/* ─ Document Header ───────────────────────────────────────── */}
          <div className="border-b-2 border-th-accent pb-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-th-accent flex items-center justify-center text-th-onAccent text-sm font-bold">⚡</div>
                <span className="text-2xl font-black text-th-text tracking-tight">ADITYA UNIVERSITY</span>
              </div>
              <p className="text-xs font-bold text-th-textMuted uppercase tracking-widest">
                Hostel Affairs &amp; Energy Management Committee
              </p>
              <h1 className="text-lg font-bold text-th-accentText mt-2">
                Electricity Bill Verification &amp; Audit Certificate
              </h1>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] font-bold text-th-textMuted uppercase tracking-wider">Report Reference</p>
              <p className="text-xs font-mono font-bold text-th-text">
                {reportRef(selectedRoomId, selectedPeriodId ?? 0, selectedRoom?.block ?? "?", selectedRoom?.hostel_type ?? "?")}
              </p>
              <p className="text-[10px] text-th-textMuted mt-1">
                Generated: {new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}
              </p>
              <p className="text-[10px] text-th-textMuted">
                {new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST
              </p>
            </div>
          </div>

          {/* ─ MANDATORY Simulated Data Disclaimer ───────────────────── */}
          {hasSimulated && (
            <div
              className="p-4 rounded-xl border-2 bg-th-warnBg border-th-warnBdr text-th-warnTxt text-xs leading-relaxed"
              role="alert"
              aria-live="polite"
            >
              <p className="font-extrabold uppercase tracking-wide mb-1">
                ⚠️ Mandatory Data Source Notice — Simulated Demo Data Present
              </p>
              <p>
                This report contains one or more entries generated by BillShield's simulation engine,
                labelled as <strong className="underline">Simulated Demo Data</strong>. In strict compliance
                with BillShield's core integrity guidelines, simulated readings are produced for
                demonstration or validation purposes only and must <strong>never</strong> be treated as or
                compared against physical sensor measurements. The affected readings are:
              </p>
              <ul className="mt-2 ml-4 list-disc space-y-0.5">
                {isRoomSim   && <li>Room Sub-Meter Reading — <strong>Simulated Demo Data</strong></li>}
                {isHostelSim && <li>Official Hostel Meter Reading — <strong>Simulated Demo Data</strong></li>}
              </ul>
            </div>
          )}

          {/* ─ Room & Student Details ─────────────────────────────────── */}
          <section aria-label="Room and student information">
            <h3 className="text-xs font-bold uppercase tracking-wider text-th-textMuted mb-3">
              Room &amp; Student Information
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-th-surface border border-th-border text-xs">
              <div>
                <span className="text-th-textMuted font-semibold uppercase text-[10px] block">Hostel &amp; Block</span>
                <span className="font-bold text-th-text text-sm capitalize">
                  {selectedRoom?.hostel_type} Hostel · Block {selectedRoom?.block}
                </span>
              </div>
              <div>
                <span className="text-th-textMuted font-semibold uppercase text-[10px] block">Room Number</span>
                <span className="font-bold text-th-text text-sm">
                  #{selectedRoom?.room_number}{" "}
                  <span className="text-[10px] font-normal text-th-textMuted">
                    ({selectedRoom?.room_type.replace("_", "-").toUpperCase()})
                  </span>
                </span>
              </div>
              <div>
                <span className="text-th-textMuted font-semibold uppercase text-[10px] block">Floor</span>
                <span className="font-bold text-th-text text-sm">Floor {selectedRoom?.floor}</span>
              </div>
              <div>
                <span className="text-th-textMuted font-semibold uppercase text-[10px] block">Logged-in Student</span>
                <span className="font-bold text-th-text text-sm">{currentStudent?.name ?? "—"}</span>
                {currentStudent && (
                  <span className="font-mono text-[11px] text-th-textMuted block">{currentStudent.roll_number}</span>
                )}
              </div>
            </div>
          </section>

          {/* ─ Billing Period ─────────────────────────────────────────── */}
          <section aria-label="Billing period details">
            <h3 className="text-xs font-bold uppercase tracking-wider text-th-textMuted mb-3">
              Audit Billing Period
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-th-surface border border-th-border text-xs">
              <div>
                <span className="text-th-textMuted font-semibold uppercase text-[10px] block">Period Label</span>
                <span className="font-bold text-th-text text-sm">{activePeriod?.label ?? "—"}</span>
              </div>
              <div>
                <span className="text-th-textMuted font-semibold uppercase text-[10px] block">Period Start</span>
                <span className="font-bold text-th-text text-sm">
                  {activePeriod ? fmtDate(activePeriod.period_start) : "—"}
                </span>
              </div>
              <div>
                <span className="text-th-textMuted font-semibold uppercase text-[10px] block">Period End</span>
                <span className="font-bold text-th-text text-sm">
                  {activePeriod ? fmtDate(activePeriod.period_end) : "—"}
                </span>
              </div>
            </div>
          </section>

          {/* ─ Registered Roommates ───────────────────────────────────── */}
          <section aria-label="Registered roommates">
            <h3 className="text-xs font-bold uppercase tracking-wider text-th-textMuted mb-3">
              Registered Roommates (Max 3)
            </h3>
            {selectedRoom?.students && selectedRoom.students.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {selectedRoom.students.map((st, i) => (
                  <div key={st.id} className="p-3 rounded-xl border border-th-border text-xs bg-th-surface">
                    <span className="text-[10px] font-bold text-th-textMuted block mb-1">Roommate #{i + 1}</span>
                    <p className="font-bold text-th-text">{st.name}</p>
                    <p className="font-mono text-[11px] text-th-textMuted">{st.roll_number}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-th-textMuted italic">No roommates registered for this room.</p>
            )}
          </section>

          {/* ─ Verification Summary ───────────────────────────────────── */}
          <section aria-label="Bill verification summary">
            <h3 className="text-xs font-bold uppercase tracking-wider text-th-textMuted mb-3">
              Billing Verification Summary
            </h3>

            {error ? (
              <div className="p-4 rounded-xl bg-th-warnBg border border-th-warnBdr text-xs text-th-warnTxt" role="alert">
                <p className="font-bold">Could not load comparison:</p>
                <p>{error}</p>
                <p className="mt-1 opacity-85">Ensure both a room sub-meter reading and hostel meter reading exist for this period.</p>
              </div>
            ) : !comparison ? (
              <div className="p-6 text-center text-xs text-th-textMuted border border-dashed border-th-border rounded-xl">
                Both a room sub-meter reading and an official hostel meter reading must be recorded
                for the same billing period to generate this verification table.
              </div>
            ) : (
              <>
                {/* Verdict banner */}
                <div
                  className={`mb-4 p-4 rounded-2xl border flex items-center justify-between gap-4 flex-wrap ${verdictBoxClass}`}
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-th-textMuted mb-1">Audit Finding</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="status" statusType={comparison.verdict} size="md" />
                      <span className="text-xs text-th-textSub">
                        (Applied threshold: ±{comparison.tolerance_percent}%)
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-th-textMuted uppercase font-semibold">Net Difference</p>
                    <p className="text-xl font-black font-mono text-th-text">
                      {comparison.difference_units > 0 ? "+" : ""}
                      {comparison.difference_units.toFixed(2)} kWh
                    </p>
                    <p className="text-xs font-bold text-th-textSub font-mono">
                      ({comparison.difference_percent > 0 ? "+" : ""}
                      {comparison.difference_percent.toFixed(2)}%)
                    </p>
                  </div>
                </div>

                {/* Detail table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border border-th-border rounded-xl overflow-hidden">
                    <thead className="bg-th-surface border-b border-th-border">
                      <tr className="font-semibold text-th-textMuted uppercase tracking-wider">
                        <th className="py-2.5 px-4">Parameter</th>
                        <th className="py-2.5 px-4">Student Sub-Meter</th>
                        <th className="py-2.5 px-4">Hostel Official Meter</th>
                        <th className="py-2.5 px-4">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-th-borderSub font-medium">
                      <tr>
                        <td className="py-3 px-4 text-th-textSub">Start → End Reading</td>
                        <td className="py-3 px-4 font-mono text-th-text">
                          {comparison.room_reading_start.toFixed(2)} → {comparison.room_reading_end.toFixed(2)} kWh
                        </td>
                        <td className="py-3 px-4 font-mono text-th-text">
                          {comparison.hostel_reading_start != null && comparison.hostel_reading_end != null
                            ? `${comparison.hostel_reading_start.toFixed(2)} → ${comparison.hostel_reading_end.toFixed(2)} kWh`
                            : "Direct unit entry"}
                        </td>
                        <td className="py-3 px-4 font-mono text-th-textMuted">—</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 text-th-textSub">Electricity Units</td>
                        <td className="py-3 px-4 font-mono font-bold text-th-text">
                          {comparison.room_units.toFixed(2)} kWh
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-th-text">
                          {comparison.hostel_units.toFixed(2)} kWh
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-th-text">
                          {comparison.difference_units > 0 ? "+" : ""}
                          {comparison.difference_units.toFixed(2)} kWh
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 text-th-textSub">Applied Rate</td>
                        <td colSpan={3} className="py-3 px-4 font-mono font-bold text-th-text">
                          ₹{comparison.rate_per_unit.toFixed(2)} per kWh
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 text-th-textSub">Calculated Bill</td>
                        <td className="py-3 px-4 font-mono font-bold text-th-accentText">
                          ₹{comparison.room_bill.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-th-text">
                          ₹{comparison.hostel_bill.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-th-text">
                          ₹{(comparison.room_bill - comparison.hostel_bill).toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 text-th-textSub">Data Source Tag</td>
                        <td className="py-3 px-4">
                          <Badge variant="source" sourceType={comparison.room_reading_source} size="sm" />
                          {isRoomSim && (
                            <span className="block text-[10px] text-th-warnTxt font-bold mt-1">
                              ⚠️ SIMULATED — Not a physical meter reading
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="source" sourceType={comparison.hostel_reading_source} size="sm" />
                          {isHostelSim && (
                            <span className="block text-[10px] text-th-warnTxt font-bold mt-1">
                              ⚠️ SIMULATED — Not a physical meter reading
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-th-textMuted">
                          {comparison.difference_percent.toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* ─ Appliance Theoretical Estimate ────────────────────────── */}
          <section aria-label="Appliance theoretical estimate">
            <h3 className="text-xs font-bold uppercase tracking-wider text-th-textMuted mb-1">
              Appliance Baseline — Theoretical Estimate
            </h3>
            <p className="text-[10px] text-th-warnTxt font-bold mb-3 flex items-center gap-1">
              <span>⚡</span>
              <span>ESTIMATE ONLY — Not derived from meter readings. Based on appliance wattage assumptions.</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border border-th-border rounded-xl overflow-hidden">
                <thead className="bg-th-surface border-b border-th-border">
                  <tr className="font-semibold text-th-textMuted uppercase tracking-wider">
                    <th className="py-2 px-3">Appliance</th>
                    <th className="py-2 px-3">Qty</th>
                    <th className="py-2 px-3">Rated Power</th>
                    <th className="py-2 px-3">Daily Usage</th>
                    <th className="py-2 px-3 text-right">Est. ({periodDays} days)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-th-borderSub">
                  {selectedRoom?.appliances.map((app) => {
                    const kwhPeriod = (
                      (app.rated_watts * app.quantity * app.assumed_daily_hours * periodDays) / 1000
                    ).toFixed(2);
                    return (
                      <tr key={app.id}>
                        <td className="py-2 px-3 font-medium text-th-text">{app.name}</td>
                        <td className="py-2 px-3 font-mono text-th-textSub">{app.quantity}</td>
                        <td className="py-2 px-3 font-mono text-th-textSub">{app.rated_watts} W</td>
                        <td className="py-2 px-3 font-mono text-th-textSub">{app.assumed_daily_hours} hrs/day</td>
                        <td className="py-2 px-3 font-mono font-bold text-right text-th-text">
                          ~{kwhPeriod} kWh
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-th-surface font-bold">
                    <td colSpan={4} className="py-2 px-3 text-th-text">
                      Total Theoretical Estimate
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-right text-th-accentText">
                      ~{totalEstimateKwh.toFixed(2)} kWh
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ─ Full Data-Source Integrity Statement ───────────────────── */}
          <section
            className="p-4 rounded-2xl bg-th-hero border border-th-heroBdr text-th-heroText text-xs leading-relaxed space-y-2"
            aria-label="Data source integrity statement"
          >
            <p className="font-bold text-sm">BillShield Data Integrity Declaration</p>
            <p className="text-th-heroSub">
              Every reading stored in BillShield carries an unforgeable source tag: either
              <strong className="text-th-heroText"> "Manual Entry"</strong>,
              <strong className="text-th-heroText"> "Simulated Demo Data"</strong>, or
              <strong className="text-th-heroText"> "Sensor (Future)"</strong>.
              Simulated demo data is generated exclusively for educational and demonstration purposes
              and is <em className="underline">never</em> presented as, or compared against, real physical
              sensor data. This report faithfully reproduces all source tags as stored in the system.
            </p>
            {hasSimulated ? (
              <p className="text-th-warnTxt font-bold">
                ⚠️ This report contains Simulated Demo Data — refer to the highlighted cells above.
              </p>
            ) : (
              <p className="text-th-matchTxt font-semibold">
                ✅ All readings in this report are from real manual entry — no simulated data.
              </p>
            )}
            <p className="text-th-textMuted text-[10px]">
              BillShield v1.0.0 · Aditya University Hostel Verification System ·
              Report generated {new Date().toISOString()} UTC
            </p>
          </section>

          {/* ─ Signatures ────────────────────────────────────────────── */}
          <div className="pt-6 border-t border-th-border grid grid-cols-3 gap-6 text-center text-xs">
            <div>
              <div className="h-12 border-b border-th-border mb-2" />
              <p className="font-bold text-th-text">Room Representative</p>
              <p className="text-[10px] text-th-textMuted">Student Signature</p>
            </div>
            <div>
              <div className="h-12 border-b border-th-border mb-2" />
              <p className="font-bold text-th-text">Hostel Warden</p>
              <p className="text-[10px] text-th-textMuted">Hostel Authority Stamp</p>
            </div>
            <div>
              <div className="h-12 border-b border-th-border mb-2" />
              <p className="font-bold text-th-text">BillShield Audit Seal</p>
              <p className="text-[10px] text-th-matchTxt font-bold uppercase">System Verified</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
