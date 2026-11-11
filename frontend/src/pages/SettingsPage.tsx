import React, { useState, useEffect } from "react";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";

export const SettingsPage: React.FC = () => {
  const { success, error } = useToast();
  const [rate, setRate] = useState<string>("10.0");
  const [tolerance, setTolerance] = useState<string>("5.0");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    api.settings
      .get()
      .then((s) => {
        setRate(s.rate_per_unit.toString());
        setTolerance(s.tolerance_percent.toString());
      })
      .catch((err) => error("Settings Error", err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = parseFloat(rate);
    const tolNum = parseFloat(tolerance);

    if (isNaN(rateNum) || rateNum <= 0) {
      error("Validation", "Rate per unit must be greater than zero");
      return;
    }
    if (isNaN(tolNum) || tolNum <= 0 || tolNum > 100) {
      error("Validation", "Tolerance percent must be between 0 and 100%");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await api.settings.update({
        rate_per_unit: rateNum,
        tolerance_percent: tolNum,
      });
      success("Settings Saved", `Updated rate to ₹${updated.rate_per_unit}/kWh and tolerance to ±${updated.tolerance_percent}%`);
      window.dispatchEvent(new CustomEvent("billshield:data-updated"));
    } catch (err: any) {
      error("Failed to Save", err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">
          System Configuration & Guidelines
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Adjust billing rates and tolerance thresholds according to Aditya University hostel regulations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editable Rate & Tolerance Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Verification Parameters</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Editable defaults: ₹10/unit and ±5% tolerance
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-xs text-slate-400">Loading settings…</p>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <Input
                  label="Electricity Rate (₹ per kWh)"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  helperText="Default is ₹10.0 per unit"
                  required
                />

                <Input
                  label="Match Tolerance (± %)"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="100"
                  value={tolerance}
                  onChange={(e) => setTolerance(e.target.value)}
                  helperText="Allowable deviation before flagging mismatch"
                  required
                />

                <div className="pt-2">
                  <Button type="submit" variant="primary" className="w-full" isLoading={isSaving}>
                    Update Parameters
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Hostel Rules & Non-negotiables Reference */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Aditya University Hostel Architecture</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Fixed project constraints and appliance inventory specification
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h4 className="font-bold text-navy-900 mb-2 flex items-center justify-between">
                  <span>AC Room Profile</span>
                  <span className="px-2 py-0.5 rounded-full bg-electric-100 text-electric-800 text-[10px]">
                    AC Type
                  </span>
                </h4>
                <ul className="space-y-1.5 text-slate-600">
                  <li>• 1 Air Conditioner (1500W, ~8 hrs/day)</li>
                  <li>• 2 Normal Fans (75W, ~12 hrs/day)</li>
                  <li>• 2 Tube Lights (40W, ~8 hrs/day)</li>
                  <li>• 1 Washroom Light (15W, ~2 hrs/day)</li>
                  <li>• 1 Balcony Light (15W, ~3 hrs/day)</li>
                  <li className="pt-1 font-semibold text-navy-900">• Capacity: 3 Roommates</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <h4 className="font-bold text-navy-900 mb-2 flex items-center justify-between">
                  <span>Non-AC Room Profile</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 text-[10px]">
                    Non-AC Type
                  </span>
                </h4>
                <ul className="space-y-1.5 text-slate-600">
                  <li>• 2 Normal Fans (75W, ~14 hrs/day)</li>
                  <li>• 2 Tube Lights (40W, ~8 hrs/day)</li>
                  <li>• 1 Washroom Light (15W, ~2 hrs/day)</li>
                  <li>• 1 Balcony Light (15W, ~3 hrs/day)</li>
                  <li className="pt-1 font-semibold text-navy-900">• Capacity: 3 Roommates</li>
                </ul>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-navy-900 text-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">Source Tag Classification</span>
                <span className="text-[10px] text-electric-400 font-mono">NON-NEGOTIABLE RULE</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Every reading stored in BillShield carries an unforgeable source tag. Simulated demo data is NEVER presented as physical sensor data.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="source" sourceType="Manual Entry" size="sm" />
                <Badge variant="source" sourceType="Simulated Demo Data" size="sm" />
                <Badge variant="source" sourceType="Sensor (Future)" size="sm" />
              </div>
            </div>

            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 text-[11px] leading-relaxed">
              <span className="font-bold">Hardware Roadmap:</span> ESP32 smart meter hardware code is
              strictly future scope. The REST API is already designed to receive automated ESP32 payloads
              with zero schema modifications required.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
