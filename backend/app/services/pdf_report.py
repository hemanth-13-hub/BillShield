"""
PDF Electricity Verification Report generator for BillShield.

Uses ReportLab to generate an official, downloadable audit PDF using the exact
calculations produced by `app.services.compare.compute_comparison` so all PDF
numbers match the website UI 1:1.

Includes:
  - BillShield & Aditya University hostel branding
  - Student name & roll number, hostel category, block, room number, AC/Non-AC
  - Billing period, start/end readings, consumed units, difference in units
  - Electricity rate, expected room bill, hostel-reported bill, difference in Rs.
  - Vector consumption comparison graph (Room Sensor vs Hostel Meter in kWh)
  - Reading timestamps, verification notes, limitations, and generation date
  - Diagonal "DEMO / SIMULATED DATA" watermark whenever simulated entries appear
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Optional
from zoneinfo import ZoneInfo

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models import (
    BillingPeriod,
    HostelMeterReading,
    ReadingSource,
    Room,
    RoomReading,
    Settings,
    Student,
)
from app.services.compare import (
    VERDICT_MATCH,
    VERDICT_MINOR,
    compute_comparison,
)

IST = ZoneInfo("Asia/Kolkata")

# Palette matching BillShield dashboard
C_NAVY = colors.HexColor("#0B1F3A")
C_NAVY_MED = colors.HexColor("#1C3C6B")
C_BLUE = colors.HexColor("#2563EB")
C_TEAL = colors.HexColor("#0D9488")
C_BG_SUBTLE = colors.HexColor("#F4F7FB")
C_BORDER = colors.HexColor("#CBD5E1")
C_TEXT = colors.HexColor("#0F172A")
C_MUTED = colors.HexColor("#64748B")
C_WHITE = colors.white

# Status colours strictly for verdicts & simulated notices
C_GREEN_BG = colors.HexColor("#ECFDF5")
C_GREEN_TXT = colors.HexColor("#065F46")
C_AMBER_BG = colors.HexColor("#FFFBEB")
C_AMBER_BORDER = colors.HexColor("#F59E0B")
C_AMBER_TXT = colors.HexColor("#92400E")
C_RED_BG = colors.HexColor("#FEF2F2")
C_RED_TXT = colors.HexColor("#991B1B")


def _fmt_ist(dt: datetime) -> str:
    """Format aware/naive datetime in IST."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    else:
        dt = dt.astimezone(IST)
    return dt.strftime("%d %b %Y, %I:%M %p IST")


def _source_label(source: str) -> str:
    if source == ReadingSource.SIMULATED.value:
        return "SIMULATED DATA"
    return source


def _build_comparison_chart(
    comparison: dict,
    bp_label: str,
    historical_pairs: list[tuple[str, float, float]],
) -> Drawing:
    """
    Build a clean vector bar comparison graph showing Room Sensor vs Hostel Meter
    consumption in kWh (active period + up to 2 prior periods if present).
    """
    width = 172 * mm
    height = 56 * mm
    d = Drawing(width, height)

    # Outer container card
    d.add(
        Rect(
            0, 0, width, height,
            fillColor=C_BG_SUBTLE,
            strokeColor=C_BORDER,
            strokeWidth=0.6,
            rx=4, ry=4,
        )
    )

    # Chart title & legend
    d.add(
        String(
            8 * mm, height - 6.5 * mm,
            "Consumption Comparison Graph (kWh)",
            fontName="Helvetica-Bold", fontSize=9, fillColor=C_NAVY,
        )
    )

    # Legend on top right
    d.add(Rect(width - 68 * mm, height - 7 * mm, 3.5 * mm, 3.5 * mm, fillColor=C_BLUE, strokeWidth=0))
    d.add(
        String(
            width - 63 * mm, height - 6.2 * mm,
            "Room Sensor", fontName="Helvetica", fontSize=7.5, fillColor=C_TEXT,
        )
    )
    d.add(Rect(width - 36 * mm, height - 7 * mm, 3.5 * mm, 3.5 * mm, fillColor=C_TEAL, strokeWidth=0))
    d.add(
        String(
            width - 31 * mm, height - 6.2 * mm,
            "Hostel Meter", fontName="Helvetica", fontSize=7.5, fillColor=C_TEXT,
        )
    )

    # Series data: prefer historical_pairs up to 3, else single active period
    bars_data = historical_pairs[-3:] if historical_pairs else [
        (bp_label, comparison["room_units"], comparison["hostel_units"])
    ]

    plot_left = 18 * mm
    plot_right = width - 10 * mm
    plot_bottom = 11 * mm
    plot_top = height - 13 * mm
    plot_w = plot_right - plot_left
    plot_h = plot_top - plot_bottom

    max_val = max(
        [max(r, h) for _, r, h in bars_data] + [10.0]
    )
    y_max = max_val * 1.22

    # Grid lines + Y axis ticks
    steps = 4
    for i in range(steps + 1):
        frac = i / steps
        y = plot_bottom + frac * plot_h
        val = y_max * frac
        d.add(
            Line(
                plot_left, y, plot_right, y,
                strokeColor=colors.HexColor("#E2E8F0") if i > 0 else C_BORDER,
                strokeWidth=0.5 if i > 0 else 0.8,
            )
        )
        d.add(
            String(
                plot_left - 2 * mm, y - 2,
                f"{val:.0f}",
                fontName="Helvetica", fontSize=7, fillColor=C_MUTED, textAnchor="end",
            )
        )

    # Y axis label
    d.add(
        String(
            4 * mm, plot_bottom + plot_h / 2 - 4,
            "kWh", fontName="Helvetica-Bold", fontSize=7.5, fillColor=C_MUTED,
        )
    )

    # Grouped bars
    group_count = len(bars_data)
    group_w = plot_w / group_count
    bar_w = min(14 * mm, group_w * 0.24)
    bar_gap = 2.5 * mm

    for idx, (lbl, room_kwh, hostel_kwh) in enumerate(bars_data):
        cx = plot_left + group_w * (idx + 0.5)
        r_h = (room_kwh / y_max) * plot_h
        h_h = (hostel_kwh / y_max) * plot_h

        # Room bar
        rx = cx - bar_w - bar_gap / 2
        d.add(Rect(rx, plot_bottom, bar_w, r_h, fillColor=C_BLUE, strokeWidth=0))
        d.add(
            String(
                rx + bar_w / 2, plot_bottom + r_h + 1.8 * mm,
                f"{room_kwh:.1f}",
                fontName="Helvetica-Bold", fontSize=7, fillColor=C_BLUE, textAnchor="middle",
            )
        )

        # Hostel bar
        hx = cx + bar_gap / 2
        d.add(Rect(hx, plot_bottom, bar_w, h_h, fillColor=C_TEAL, strokeWidth=0))
        d.add(
            String(
                hx + bar_w / 2, plot_bottom + h_h + 1.8 * mm,
                f"{hostel_kwh:.1f}",
                fontName="Helvetica-Bold", fontSize=7, fillColor=C_TEAL, textAnchor="middle",
            )
        )

        # Difference note & period label below axis
        diff = room_kwh - hostel_kwh
        short_lbl = lbl[:14]
        d.add(
            String(
                cx, plot_bottom - 4.2 * mm,
                f"{short_lbl}  (Diff: {diff:+.2f} kWh)",
                fontName="Helvetica-Bold", fontSize=7, fillColor=C_TEXT, textAnchor="middle",
            )
        )

    return d


def generate_verification_pdf(
    room: Room,
    billing_period: BillingPeriod,
    room_reading: RoomReading,
    hostel_reading: HostelMeterReading,
    settings: Settings,
    student: Optional[Student] = None,
    historical_pairs: Optional[list[tuple[str, float, float]]] = None,
) -> bytes:
    """
    Generate the downloadable PDF verification report and return raw PDF bytes.
    """
    comparison = compute_comparison(room_reading, hostel_reading, settings)
    is_simulated = (
        room_reading.source == ReadingSource.SIMULATED.value
        or hostel_reading.source == ReadingSource.SIMULATED.value
    )
    generated_at_ist = datetime.now(tz=IST)
    report_ref = f"BS-{room.hostel_type[:1].upper()}{room.block}-{room.room_number}-{billing_period.id}"

    buf = BytesIO()

    def _draw_page_decor(canvas: Canvas, doc_obj: SimpleDocTemplate) -> None:
        canvas.saveState()
        page_w, page_h = A4

        # Diagonal watermark across every page when simulated demo data is included
        if is_simulated:
            canvas.saveState()
            canvas.translate(page_w / 2.0, page_h / 2.0)
            canvas.rotate(42)
            canvas.setFillColor(colors.Color(0.85, 0.45, 0.02, alpha=0.14))
            canvas.setFont("Helvetica-Bold", 38)
            canvas.drawCentredString(0, 18, "DEMO / SIMULATED DATA")
            canvas.setFont("Helvetica-Bold", 14)
            canvas.drawCentredString(0, -14, "SAMPLE VERIFICATION DATA - NOT ACTUAL SENSOR MEASUREMENTS")
            canvas.restoreState()

        # Crisp footer on every page
        canvas.setStrokeColor(C_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(16 * mm, 14 * mm, page_w - 16 * mm, 14 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(C_MUTED)
        canvas.drawString(
            16 * mm, 10 * mm,
            f"BillShield v1.0.0 | Aditya University Hostel Electricity Verification | Ref: {report_ref}",
        )
        canvas.drawRightString(
            page_w - 16 * mm, 10 * mm,
            f"Page {doc_obj.page} | Generated {_fmt_ist(generated_at_ist)}",
        )
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=18 * mm,
        title=f"BillShield Audit Report - Room {room.room_number} - {billing_period.label}",
        author="BillShield - Aditya University",
    )

    styles = getSampleStyleSheet()
    s_title = ParagraphStyle(
        "BSTitle", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=16, textColor=C_WHITE, leading=19,
    )
    s_sub = ParagraphStyle(
        "BSSub", parent=styles["Normal"],
        fontName="Helvetica", fontSize=8.5, textColor=colors.HexColor("#CBD5E1"), leading=11,
    )
    s_meta_right = ParagraphStyle(
        "BSMetaR", parent=styles["Normal"],
        fontName="Helvetica", fontSize=8, textColor=C_WHITE, alignment=TA_RIGHT, leading=11,
    )
    s_section = ParagraphStyle(
        "BSSect", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=9.5, textColor=C_NAVY, spaceBefore=6, spaceAfter=4,
    )
    s_body = ParagraphStyle(
        "BSBody", parent=styles["Normal"],
        fontName="Helvetica", fontSize=8.2, textColor=C_TEXT, leading=11.5,
    )
    s_small = ParagraphStyle(
        "BSSmall", parent=styles["Normal"],
        fontName="Helvetica", fontSize=7.5, textColor=C_MUTED, leading=10.5,
    )

    story: list = []

    # ── 1. Brand Header Banner ──────────────────────────────────────────────
    header_tbl = Table(
        [
            [
                Paragraph(
                    "BILLSHIELD<br/><font size='9' color='#93C5FD'>Smart Hostel Electricity Verification Report</font>",
                    s_title,
                ),
                Paragraph(
                    f"<b>ADITYA UNIVERSITY</b><br/>"
                    f"Report Ref: <b>{report_ref}</b><br/>"
                    f"Generated: {_fmt_ist(generated_at_ist)}",
                    s_meta_right,
                ),
            ]
        ],
        colWidths=[106 * mm, 72 * mm],
    )
    header_tbl.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), C_NAVY),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("LINEBELOW", (0, 0), (-1, -1), 3, C_BLUE),
        ])
    )
    story.append(header_tbl)
    story.append(Spacer(1, 4 * mm))

    # ── 2. Mandatory Demo / Simulated Data Disclosure Banner ────────────────
    if is_simulated:
        banner_para = Paragraph(
            "<b>DEMO / SIMULATED DATA NOTICE:</b> One or more meter readings in this certificate are "
            "<b>SIMULATED SAMPLE DATA</b> generated solely for demonstration and calculation verification. "
            "Simulated entries must <b>never</b> be presented as actual physical energy sensor measurements.",
            ParagraphStyle("SimWarn", parent=s_body, textColor=C_AMBER_TXT, fontSize=8),
        )
        banner_tbl = Table([[banner_para]], colWidths=[178 * mm])
        banner_tbl.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), C_AMBER_BG),
                ("BOX", (0, 0), (-1, -1), 1.2, C_AMBER_BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ])
        )
    else:
        banner_para = Paragraph(
            "<b>DATA INTEGRITY NOTICE:</b> All readings in this report were manually entered for demonstration "
            "(no physical ESP32 hardware sensor is connected).",
            ParagraphStyle("ManInfo", parent=s_body, textColor=C_NAVY, fontSize=8),
        )
        banner_tbl = Table([[banner_para]], colWidths=[178 * mm])
        banner_tbl.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), C_BG_SUBTLE),
                ("BOX", (0, 0), (-1, -1), 0.8, C_BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ])
        )
    story.append(banner_tbl)
    story.append(Spacer(1, 3.5 * mm))

    # ── 3. Student & Aditya University Hostel Details ───────────────────────
    story.append(Paragraph("STUDENT & ADITYA UNIVERSITY HOSTEL IDENTIFICATION", s_section))

    primary_student = student or (room.students[0] if room.students else None)
    student_name_str = primary_student.name if primary_student else "Not Registered"
    roll_str = primary_student.roll_number if primary_student else "—"
    roommates_str = (
        ", ".join(f"{st.name} ({st.roll_number})" for st in room.students)
        if room.students
        else "No roommates registered"
    )
    hostel_label = "Boys Hostel" if room.hostel_type == "boys" else "Girls Hostel"
    room_type_label = "AC Room" if room.room_type == "ac" else "Non-AC Room"

    id_rows = [
        [
            Paragraph("<b>Student Name</b>", s_small),
            Paragraph(student_name_str, s_body),
            Paragraph("<b>University Roll Number</b>", s_small),
            Paragraph(f"<b>{roll_str}</b>", s_body),
        ],
        [
            Paragraph("<b>Hostel Category</b>", s_small),
            Paragraph(hostel_label, s_body),
            Paragraph("<b>Block & Room Number</b>", s_small),
            Paragraph(f"Block {room.block} · Room #{room.room_number} (Floor {room.floor})", s_body),
        ],
        [
            Paragraph("<b>Room Type</b>", s_small),
            Paragraph(f"<b>{room_type_label}</b>", s_body),
            Paragraph("<b>Billing Period</b>", s_small),
            Paragraph(
                f"<b>{billing_period.label}</b> ({billing_period.period_start} to {billing_period.period_end})",
                s_body,
            ),
        ],
        [
            Paragraph("<b>Roommates (Max 3)</b>", s_small),
            Paragraph(roommates_str, s_body),
            "", "",
        ],
    ]
    id_tbl = Table(id_rows, colWidths=[34 * mm, 55 * mm, 36 * mm, 53 * mm])
    id_tbl.setStyle(
        TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER),
            ("SPAN", (1, 3), (3, 3)),
            ("BACKGROUND", (0, 0), (0, -1), C_BG_SUBTLE),
            ("BACKGROUND", (2, 0), (2, 2), C_BG_SUBTLE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(id_tbl)
    story.append(Spacer(1, 3.5 * mm))

    # ── 4. Dual Meter Readings & Financial Comparison Table ─────────────────
    story.append(Paragraph("DUAL METER READINGS & BILL COMPARISON", s_section))

    room_units = comparison["room_units"]
    hostel_units = comparison["hostel_units"]
    diff_units = comparison["difference_units"]
    diff_pct = comparison["difference_percent"]
    rate = comparison["rate_per_unit"]
    expected_room_bill = comparison["room_bill"]
    hostel_bill = comparison["hostel_bill"]
    diff_rupees = round(expected_room_bill - hostel_bill, 2)

    hostel_start_end = (
        f"{hostel_reading.reading_start:.2f} -> {hostel_reading.reading_end:.2f} kWh"
        if hostel_reading.reading_start is not None and hostel_reading.reading_end is not None
        else "Direct unit entry"
    )

    verdict = comparison["verdict"]
    if verdict == VERDICT_MATCH:
        v_bg, v_fg = C_GREEN_BG, C_GREEN_TXT
    elif verdict == VERDICT_MINOR:
        v_bg, v_fg = C_AMBER_BG, C_AMBER_TXT
    else:
        v_bg, v_fg = C_RED_BG, C_RED_TXT

    comp_rows = [
        [
            Paragraph("<b>Verification Metric</b>", s_small),
            Paragraph("<b>Room Sensor Reading</b>", s_small),
            Paragraph("<b>Hostel Meter Reading</b>", s_small),
            Paragraph("<b>Difference / Value</b>", s_small),
        ],
        [
            Paragraph("Starting Reading", s_body),
            Paragraph(f"{room_reading.reading_start:.2f} kWh", s_body),
            Paragraph(
                f"{hostel_reading.reading_start:.2f} kWh" if hostel_reading.reading_start is not None else "—",
                s_body,
            ),
            Paragraph("—", s_small),
        ],
        [
            Paragraph("Ending Reading", s_body),
            Paragraph(f"{room_reading.reading_end:.2f} kWh", s_body),
            Paragraph(
                f"{hostel_reading.reading_end:.2f} kWh" if hostel_reading.reading_end is not None else "—",
                s_body,
            ),
            Paragraph(hostel_start_end, s_small),
        ],
        [
            Paragraph("<b>Total Units Consumed</b>", s_body),
            Paragraph(f"<b>{room_units:.2f} kWh</b>", s_body),
            Paragraph(f"<b>{hostel_units:.2f} kWh</b>", s_body),
            Paragraph(f"<b>{diff_units:+.2f} kWh ({diff_pct:+.2f}%)</b>", s_body),
        ],
        [
            Paragraph("Electricity Rate", s_body),
            Paragraph(f"Rs. {rate:.2f} / kWh", s_body),
            Paragraph(f"Rs. {rate:.2f} / kWh", s_body),
            Paragraph(f"Tolerance: +/-{comparison['tolerance_percent']:.1f}%", s_small),
        ],
        [
            Paragraph("<b>Bill Comparison (Rupees)</b>", s_body),
            Paragraph(f"<b>Expected: Rs. {expected_room_bill:,.2f}</b>", s_body),
            Paragraph(f"<b>Reported: Rs. {hostel_bill:,.2f}</b>", s_body),
            Paragraph(f"<b>Diff: Rs. {diff_rupees:+,.2f}</b>", s_body),
        ],
        [
            Paragraph("Reading Timestamp", s_body),
            Paragraph(_fmt_ist(room_reading.recorded_at), s_small),
            Paragraph(_fmt_ist(hostel_reading.recorded_at), s_small),
            Paragraph("IST Timezone", s_small),
        ],
        [
            Paragraph("Data Source Tag", s_body),
            Paragraph(f"<b>{_source_label(room_reading.source)}</b>", s_body),
            Paragraph(f"<b>{_source_label(hostel_reading.source)}</b>", s_body),
            Paragraph(
                f"<b>{verdict}</b>",
                ParagraphStyle("VStyle", parent=s_body, textColor=v_fg),
            ),
        ],
    ]

    comp_tbl = Table(comp_rows, colWidths=[40 * mm, 46 * mm, 46 * mm, 46 * mm])
    comp_tbl.setStyle(
        TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER),
            ("BACKGROUND", (0, 0), (-1, 0), C_BG_SUBTLE),
            ("BACKGROUND", (3, 7), (3, 7), v_bg),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(comp_tbl)
    story.append(Spacer(1, 4 * mm))

    # ── 5. Vector Consumption Comparison Graph ──────────────────────────────
    story.append(
        _build_comparison_chart(
            comparison=comparison,
            bp_label=billing_period.label,
            historical_pairs=historical_pairs or [],
        )
    )
    story.append(Spacer(1, 3.5 * mm))

    # ── 6. Room Appliance Configuration Summary (Estimate Reference) ────────
    if room.appliances:
        story.append(
            Paragraph("ROOM APPLIANCE PROFILE (THEORETICAL ESTIMATE REFERENCE)", s_section)
        )
        app_rows = [
            [
                Paragraph("<b>Appliance</b>", s_small),
                Paragraph("<b>Qty</b>", s_small),
                Paragraph("<b>Power (W)</b>", s_small),
                Paragraph("<b>Assumed Use</b>", s_small),
                Paragraph("<b>Est. Monthly kWh</b>", s_small),
            ]
        ]
        for app in room.appliances:
            est_m = ((app.rated_watts * app.quantity * app.assumed_daily_hours) / 1000.0) * 30.0
            app_rows.append([
                Paragraph(app.name, s_small),
                Paragraph(str(app.quantity), s_small),
                Paragraph(f"{app.rated_watts:.0f} W", s_small),
                Paragraph(f"{app.assumed_daily_hours:.1f} h/day", s_small),
                Paragraph(f"~{est_m:.1f} kWh", s_small),
            ])
        app_tbl = Table(app_rows, colWidths=[58 * mm, 20 * mm, 30 * mm, 35 * mm, 35 * mm])
        app_tbl.setStyle(
            TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.4, C_BORDER),
                ("BACKGROUND", (0, 0), (-1, 0), C_BG_SUBTLE),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ])
        )
        story.append(app_tbl)
        story.append(Spacer(1, 3.5 * mm))

    # ── 7. Verification Notes & Limitations ─────────────────────────────────
    story.append(Paragraph("VERIFICATION NOTES & LIMITATIONS", s_section))
    room_note_txt = room_reading.notes or "None recorded"
    hostel_note_txt = hostel_reading.notes or "None recorded"

    notes_text = (
        f"<b>Status Finding ({verdict}):</b> Difference is {diff_units:+.2f} kWh "
        f"({diff_pct:+.2f}%, Rs. {diff_rupees:+,.2f}) at configured rate Rs. {rate:.2f}/kWh and tolerance "
        f"+/-{comparison['tolerance_percent']:.1f}%. Differences do not automatically indicate fraud; "
        f"verify circuit boundaries, reading dates, and meter digits.<br/>"
        f"<b>Recorded Entry Notes:</b> Room Sensor: <i>{room_note_txt}</i> | Hostel Meter: <i>{hostel_note_txt}</i>.<br/>"
        f"<b>System Limitations:</b> (1) No physical ESP32 sensor hardware is connected in this demo; "
        f"all readings are manually entered or clearly labelled SIMULATED DATA. "
        f"(2) Both meters must monitor the identical electrical boundary and cover identical billing period dates."
    )
    notes_tbl = Table([[Paragraph(notes_text, s_small)]], colWidths=[178 * mm])
    notes_tbl.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), C_BG_SUBTLE),
            ("BOX", (0, 0), (-1, -1), 0.5, C_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ])
    )
    story.append(notes_tbl)

    doc.build(story, onFirstPage=_draw_page_decor, onLaterPages=_draw_page_decor)
    return buf.getvalue()

