import { Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";
import { useTheme } from "./hooks/useTheme";
import { AppLayout } from "./layouts/AppLayout";
import { AuthLayout } from "./layouts/AuthLayout";
import { DashboardPage } from "./pages/DashboardPage";
import ComponentGalleryPage from "./pages/dev/ComponentGalleryPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { LoginPage } from "./pages/LoginPage";
import { MonitorsPage } from "./pages/MonitorsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";

/** The toast area follows the app theme. */
function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="top-right" closeButton richColors />;
}

export default function App() {
  return (
    <>
      <Routes>
        {/* Logged-out only: a logged-in visitor is sent on to "/" (or the page they came from) */}
        <Route element={<PublicOnlyRoute />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
        </Route>

        {/* Logged-in only. Phase 6 adds /monitors/new, /monitors/:id and /incidents/:id here */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="monitors" element={<MonitorsPage />} />
            <Route path="incidents" element={<IncidentsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            {import.meta.env.DEV && (
              <Route path="dev/components" element={<ComponentGalleryPage />} />
            )}
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ThemedToaster />
    </>
  );
}
