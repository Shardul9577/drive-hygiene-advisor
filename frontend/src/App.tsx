import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { DuplicatesPage } from "./pages/DuplicatesPage";
import { LargeFilesPage } from "./pages/LargeFilesPage";
import { OverviewPage } from "./pages/OverviewPage";
import { RiskyFilesPage } from "./pages/RiskyFilesPage";
import { ScanProvider } from "./scan/ScanContext";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <ScanProvider>
                  <DashboardLayout />
                </ScanProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="duplicates" element={<DuplicatesPage />} />
            <Route path="large-files" element={<LargeFilesPage />} />
            <Route path="risky-files" element={<RiskyFilesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
