import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { RoomProvider } from "./context/RoomContext";
import { DarkModeProvider } from "./context/DarkModeContext";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { RegisterPage } from "./pages/RegisterPage";
import { RoomConfigPage } from "./pages/RoomConfigPage";
import { ReadingsPage } from "./pages/ReadingsPage";
import { ComparePage } from "./pages/ComparePage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { ReportPage } from "./pages/ReportPage";
import { SettingsPage } from "./pages/SettingsPage";

/** First-screen gate: unregistered visitors see the registration flow first; registered students see their personalized dashboard. */
const HomeRoute: React.FC = () => {
  const { isRegistered } = useAuth();
  if (!isRegistered) {
    return <Navigate to="/register" replace />;
  }
  return <DashboardPage />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <DarkModeProvider>
        <ToastProvider>
          <AuthProvider>
            <RoomProvider>
              <Routes>
                <Route path="/" element={<AppLayout />}>
                  <Route index element={<HomeRoute />} />
                  <Route path="register" element={<RegisterPage />} />
                  <Route path="room" element={<RoomConfigPage />} />
                  <Route path="readings" element={<ReadingsPage />} />
                  <Route path="compare" element={<ComparePage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="history" element={<HistoryPage />} />
                  <Route path="report" element={<ReportPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </RoomProvider>
          </AuthProvider>
        </ToastProvider>
      </DarkModeProvider>
    </BrowserRouter>
  );
};

export default App;
