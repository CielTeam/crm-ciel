import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Auth0Provider } from "@auth0/auth0-react";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ADMIN_ROLES } from "@/types/roles";

import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";
import DashboardHome from "./pages/DashboardHome";
import CalendarPage from "./pages/CalendarPage";
import TasksPage from "./pages/TasksPage";
import LeavesPage from "./pages/LeavesPage";
import MessagesPage from "./pages/MessagesPage";
import MeetingsPage from "./pages/MeetingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import DirectoryPage from "./pages/DirectoryPage";
import SettingsPage from "./pages/SettingsPage";
import AdminConsolePage from "./pages/AdminConsolePage";
import AuditLogsPage from "./pages/AuditLogsPage";

const queryClient = new QueryClient();

// Auth0 configuration — replace with your Auth0 tenant values
const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN || "your-tenant.auth0.com";
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID || "your-client-id";
const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE || "https://ciel-crm-api";

const App = () => (
  <Auth0Provider
    domain={AUTH0_DOMAIN}
    clientId={AUTH0_CLIENT_ID}
    authorizationParams={{
      redirect_uri: window.location.origin,
      audience: AUTH0_AUDIENCE,
    }}
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected dashboard */}
              <Route
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<DashboardHome />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/leaves" element={<LeavesPage />} />
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/meetings" element={<MeetingsPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/directory" element={<DirectoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />

                {/* Admin-only routes */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
                      <AdminConsolePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/audit"
                  element={
                    <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
                      <AuditLogsPage />
                    </ProtectedRoute>
                  }
                />
              </Route>

              {/* Redirects */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </Auth0Provider>
);

export default App;
