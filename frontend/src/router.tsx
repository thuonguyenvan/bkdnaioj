import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './contexts/auth-context';
import { TopNavbar } from './components/navigation/top-navbar';
import { Footer } from './components/navigation/footer';
import { LoginPage } from './pages/login-page';
import { RegisterPage } from './pages/register-page';
import { HomePage } from './pages/home-page';
import { ContestDetailPage } from './pages/contest-detail-page';
import { PhaseHubPage } from './pages/phase-hub-page';
import { AdminSetupPage } from './pages/admin-setup-page';
import { TeamsPage } from './pages/teams-page';
import { NewsfeedPage } from './pages/newsfeed-page';
import { ProblemsPage } from './pages/problems-page';
import { ContestsPage } from './pages/contests-page';
import { RankingsPage } from './pages/rankings-page';
import { AdminUsersPage } from './pages/admin-users-page';
import { AdminContestCreatePage } from './pages/admin-contest-create-page';
import { AdminWorkersPage } from './pages/admin-workers-page';


// Layout shell wrapping pages with Navbar
const AppLayout: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopNavbar />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

// Route guards
const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

const AdminRoute: React.FC = () => {
  const { user, loading, isAdmin, isJury } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user || (!isAdmin && !isJury)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public / Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Authenticated routes with navigation shell */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/newsfeed" element={<NewsfeedPage />} />
            <Route path="/problems" element={<ProblemsPage />} />
            <Route path="/contests" element={<ContestsPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
            <Route path="/contests/:contestId" element={<ContestDetailPage />} />
            <Route path="/contests/:contestId/phases/:phaseKey" element={<PhaseHubPage />} />

            {/* Admin only routes */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<Navigate to="/" replace />} />
              <Route path="/admin/contests/:contestId/setup" element={<AdminSetupPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/contests/new" element={<AdminContestCreatePage />} />
              <Route path="/admin/workers" element={<AdminWorkersPage />} />
            </Route>
          </Route>
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
