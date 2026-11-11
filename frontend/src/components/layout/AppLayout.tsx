import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { useRoom } from "../../context/RoomContext";
import { api } from "../../api/client";
import { useToast } from "../ui/Toast";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

export const AppLayout: React.FC = () => {
  const { selectedRoomId, selectedPeriodId, billingPeriods } = useRoom();
  const { success, error } = useToast();

  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [variance, setVariance] = useState<number>(5.0);

  const handleSimulate = async () => {
    if (!selectedRoomId || !selectedPeriodId) {
      error("Missing Context", "Please select a room and billing period first.");
      return;
    }
    setIsSimulating(true);
    try {
      const res = await api.simulation.generate(selectedRoomId, {
        billing_period_id: selectedPeriodId,
        room_variance_percent: variance,
        hostel_variance_percent: 3.0,
      });
      success("Simulated Data Created", res.message);
      setIsSimulateModalOpen(false);
      // Trigger a soft refresh by dispatching a custom event
      window.dispatchEvent(new CustomEvent("billshield:data-updated"));
    } catch (err: any) {
      error("Simulation Failed", err.message || "Failed to generate demo data");
    } finally {
      setIsSimulating(false);
    }
  };

  const currentPeriod = billingPeriods.find((p) => p.id === selectedPeriodId);

  return (
    <div className="min-h-screen bg-surface-bg dark:bg-dark-bg flex transition-colors duration-150">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Dark Navy Sidebar */}
      <Sidebar />

      {/* Main Content Area (Offset for desktop sidebar and mobile header/bottom nav) */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72 pt-16 lg:pt-0 pb-20 lg:pb-8">
        <Header onSimulateClick={() => setIsSimulateModalOpen(true)} />

        <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto outline-none">
          <Outlet />
        </main>
      </div>

      {/* Global Simulation Modal */}
      <Modal
        isOpen={isSimulateModalOpen}
        onClose={() => setIsSimulateModalOpen(false)}
        title="Generate Simulated Demo Data"
        description="Creates realistic room & hostel meter readings tagged strictly as 'Simulated Demo Data'."
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSimulateModalOpen(false)}
              disabled={isSimulating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isSimulating}
              onClick={handleSimulate}
            >
              Generate Demo Data
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed font-medium">
            <span className="font-bold">⚠️ Non-negotiable Transparency Rule:</span> All data created
            by this generator is stamped with the <span className="underline font-bold">Simulated Demo Data</span> source tag. It will never be presented as physical sensor data.
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Billing Period
            </span>
            <p className="text-sm font-bold text-navy-900 dark:text-dark-text bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-dark-border">
              {currentPeriod ? `${currentPeriod.label} (${currentPeriod.period_start} to ${currentPeriod.period_end})` : "Select in header"}
            </p>
          </div>

          <div>
            <Input
              label="Room Consumption Random Variance (± %)"
              type="number"
              min={0}
              max={50}
              step={1}
              value={variance}
              onChange={(e) => setVariance(Number(e.target.value))}
              helperText="Baseline computed from room appliance wattages and hours."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

