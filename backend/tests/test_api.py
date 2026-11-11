"""
Integration tests covering BillShield SQLite schema, validation rules,
room isolation, dual-meter comparisons, history edits, analytics, and PDF reports.
"""

from __future__ import annotations

import base64
import zlib

from fastapi.testclient import TestClient


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    chunks = [pdf_bytes.decode("latin-1", errors="ignore")]
    idx = 0
    while True:
        start = pdf_bytes.find(b"stream", idx)
        if start == -1:
            break
        nl = pdf_bytes.find(b"\n", start)
        if nl == -1:
            break
        end = pdf_bytes.find(b"endstream", nl)
        if end == -1:
            break
        raw_stream = pdf_bytes[nl + 1 : end].strip(b"\r\n")
        for decode_fn in (
            lambda b: zlib.decompress(b),
            lambda b: zlib.decompress(base64.a85decode(b, adobe=True)),
        ):
            try:
                chunks.append(decode_fn(raw_stream).decode("latin-1", errors="ignore"))
                break
            except Exception:
                pass
        idx = end + 9
    return "\n".join(chunks)


def test_health_schema_and_hostels_catalog(client: TestClient) -> None:
    health_res = client.get("/api/v1/health")
    assert health_res.status_code == 200
    tables = set(health_res.json()["db_tables"])
    expected_tables = {
        "appliances",
        "billing_periods",
        "blocks",
        "hostel_categories",
        "hostel_meter_readings",
        "room_readings",
        "roommates",
        "rooms",
        "settings",
        "students",
        "verification_results",
    }
    assert expected_tables.issubset(tables)

    hostels_res = client.get("/api/v1/hostels")
    assert hostels_res.status_code == 200
    hostels = hostels_res.json()
    assert [h["code"] for h in hostels] == ["boys", "girls"]
    for h in hostels:
        assert [b["code"] for b in h["blocks"]] == ["A", "B", "C", "D", "E", "F", "G"]


def test_room_configuration_appliances_and_three_roommate_limit(client: TestClient) -> None:
    # Create AC Boys Block A room and Non-AC Girls Block G room
    r_ac = client.post(
        "/api/v1/rooms",
        json={
            "hostel_type": "boys",
            "block": "A",
            "room_number": "T101",
            "room_type": "ac",
            "floor": 1,
        },
    )
    assert r_ac.status_code == 201
    ac_data = r_ac.json()
    assert len(ac_data["appliances"]) == 5
    assert any(a["name"] == "Air Conditioner" for a in ac_data["appliances"])

    r_non = client.post(
        "/api/v1/rooms",
        json={
            "hostel_type": "girls",
            "block": "G",
            "room_number": "T201",
            "room_type": "non_ac",
            "floor": 2,
        },
    )
    assert r_non.status_code == 201
    non_data = r_non.json()
    assert len(non_data["appliances"]) == 4
    assert not any(a["name"] == "Air Conditioner" for a in non_data["appliances"])

    # Duplicate room identity rejected
    dup_room = client.post(
        "/api/v1/rooms",
        json={
            "hostel_type": "boys",
            "block": "A",
            "room_number": "t101",
            "room_type": "ac",
            "floor": 1,
        },
    )
    assert dup_room.status_code == 409

    # Register up to 3 roommates in AC room, reject 4th
    for i in range(1, 4):
        s_res = client.post(
            "/api/v1/students",
            json={
                "room_id": ac_data["id"],
                "name": f"Test Mate {i}",
                "roll_number": f"TESTROLL0{i}",
            },
        )
        assert s_res.status_code == 201

    roommates_res = client.get(f"/api/v1/rooms/{ac_data['id']}/roommates")
    assert roommates_res.status_code == 200
    assert [m["slot_number"] for m in roommates_res.json()] == [1, 2, 3]

    fourth = client.post(
        "/api/v1/students",
        json={
            "room_id": ac_data["id"],
            "name": "Test Mate 4",
            "roll_number": "TESTROLL04",
        },
    )
    assert fourth.status_code == 400


def test_readings_validation_isolation_compare_and_pdf_flow(client: TestClient) -> None:
    room1 = client.post(
        "/api/v1/rooms",
        json={
            "hostel_type": "boys",
            "block": "C",
            "room_number": "C301",
            "room_type": "ac",
            "floor": 3,
        },
    ).json()
    room2 = client.post(
        "/api/v1/rooms",
        json={
            "hostel_type": "girls",
            "block": "D",
            "room_number": "D401",
            "room_type": "non_ac",
            "floor": 4,
        },
    ).json()
    student = client.post(
        "/api/v1/students",
        json={
            "room_id": room1["id"],
            "name": "Demo Audit Student",
            "roll_number": "DEMO9001",
        },
    ).json()

    periods = client.get("/api/v1/billing-periods").json()
    p1, p2 = periods[0]["id"], periods[1]["id"]

    # Reject decreasing or negative readings
    bad_r = client.post(
        f"/api/v1/rooms/{room1['id']}/readings",
        json={
            "billing_period_id": p1,
            "reading_start": 500,
            "reading_end": 400,
            "source": "Manual Entry",
        },
    )
    assert bad_r.status_code == 422

    # Valid manual Room Sensor (Sep) & mismatched Hostel Meter (Oct only)
    rr1 = client.post(
        f"/api/v1/rooms/{room1['id']}/readings",
        json={
            "billing_period_id": p1,
            "reading_start": 100.0,
            "reading_end": 350.0,
            "source": "Manual Entry",
        },
    )
    assert rr1.status_code == 201
    assert rr1.json()["consumption"] == 250.0

    hr2 = client.post(
        f"/api/v1/rooms/{room1['id']}/hostel-readings",
        json={
            "billing_period_id": p2,
            "reading_start": 2000.0,
            "reading_end": 2100.0,
            "source": "Manual Entry",
        },
    )
    assert hr2.status_code == 201

    # Compare for period 1 must fail since hostel reading is only in period 2
    mismatch_period_cmp = client.get(
        f"/api/v1/rooms/{room1['id']}/compare", params={"billing_period_id": p1}
    )
    assert mismatch_period_cmp.status_code == 400

    # Add matching Sep hostel reading (260 kWh -> 4% diff vs 250 -> Readings Match)
    hr1 = client.post(
        f"/api/v1/rooms/{room1['id']}/hostel-readings",
        json={
            "billing_period_id": p1,
            "reading_start": 1740.0,
            "reading_end": 2000.0,
            "source": "Manual Entry",
        },
    )
    assert hr1.status_code == 201

    cmp_ok = client.get(
        f"/api/v1/rooms/{room1['id']}/compare", params={"billing_period_id": p1}
    )
    assert cmp_ok.status_code == 200
    cmp_body = cmp_ok.json()
    assert cmp_body["room_units"] == 250.0
    assert cmp_body["hostel_units"] == 260.0
    assert cmp_body["verdict"] == "Readings Match"

    # Stored VerificationResult exists for room1 and NEVER leaks into room2
    v1 = client.get(f"/api/v1/rooms/{room1['id']}/verifications").json()
    v2 = client.get(f"/api/v1/rooms/{room2['id']}/verifications").json()
    assert len(v1) == 1 and v1[0]["verdict"] == "Readings Match"
    assert len(v2) == 0
    assert client.get(f"/api/v1/rooms/{room2['id']}/readings").json() == []

    # PUT update reading recalculates consumption + VerificationResult
    rr1_id = rr1.json()["id"]
    upd_r = client.put(
        f"/api/v1/readings/{rr1_id}",
        json={"reading_start": 100.0, "reading_end": 410.0, "notes": "Corrected"},
    )
    assert upd_r.status_code == 200
    assert upd_r.json()["consumption"] == 310.0
    v1_after = client.get(f"/api/v1/rooms/{room1['id']}/verifications").json()
    assert v1_after[0]["room_units"] == 310.0
    assert v1_after[0]["verdict"] == "Significant Mismatch"

    # Manual PDF report generation matches calculations & omits DEMO watermark
    pdf_manual = client.get(
        f"/api/v1/rooms/{room1['id']}/report/pdf",
        params={"billing_period_id": p1, "student_id": student["id"]},
    )
    assert pdf_manual.status_code == 200
    assert pdf_manual.headers["content-type"].startswith("application/pdf")
    assert pdf_manual.content.startswith(b"%PDF-")
    manual_text = _extract_pdf_text(pdf_manual.content)
    assert "DEMO9001" in manual_text
    assert "310.00 kWh" in manual_text
    assert "Rs. 3,100.00" in manual_text
    assert "DEMO / SIMULATED DATA" not in manual_text

    # Simulated demo generation enforces source tag & includes watermark in PDF
    sim_res = client.post(
        f"/api/v1/rooms/{room1['id']}/simulate",
        json={"billing_period_id": p2, "room_variance_percent": 4.0, "hostel_variance_percent": 3.0},
    )
    assert sim_res.status_code == 201
    assert sim_res.json()["room_reading"]["source"] == "Simulated Demo Data"
    assert sim_res.json()["hostel_meter_reading"]["source"] == "Simulated Demo Data"

    pdf_sim = client.get(
        f"/api/v1/rooms/{room1['id']}/report/pdf",
        params={"billing_period_id": p2, "student_id": student["id"]},
    )
    assert pdf_sim.status_code == 200
    assert "DEMO / SIMULATED DATA" in _extract_pdf_text(pdf_sim.content)

    # Analytics endpoints
    for gran in ("hourly", "daily", "weekly", "monthly"):
        agg = client.get(f"/api/v1/rooms/{room1['id']}/aggregate", params={"granularity": gran})
        assert agg.status_code == 200
        assert len(agg.json()["data_points"]) > 0

    comp_types = client.get("/api/v1/analytics/room-type-comparison")
    assert comp_types.status_code == 200

    # Settings validation & rate update propagation
    bad_set = client.put("/api/v1/settings", json={"rate_per_unit": -5})
    assert bad_set.status_code == 422
    ok_set = client.put("/api/v1/settings", json={"rate_per_unit": 12.0, "tolerance_percent": 5.0})
    assert ok_set.status_code == 200
    assert ok_set.json()["rate_per_unit"] == 12.0

    # Deleting reading clears VerificationResult cleanly
    del_rr = client.delete(f"/api/v1/readings/{rr1_id}")
    assert del_rr.status_code == 204
    v1_remaining = client.get(f"/api/v1/rooms/{room1['id']}/verifications").json()
    assert all(row["billing_period_id"] != p1 for row in v1_remaining)

