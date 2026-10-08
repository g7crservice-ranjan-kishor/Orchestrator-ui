import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { LoginPage } from './features/auth/LoginPage';
import { Layout } from './components/Layout';
import { OverviewPage } from './features/overview/OverviewPage';
import { UsersPage } from './features/users/UsersPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { RequirementIntakePage } from './features/requirements/RequirementIntakePage';
import { PlanningPage } from './features/planning/PlanningPage';
import { RunMonitorPage } from './features/runs/RunMonitorPage';
import { BoardPage } from './features/board/BoardPage';
import { AuditPage } from './features/audit/AuditPage';

/** Application root: providers + route table. */
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<OverviewPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:id/requirements" element={<RequirementIntakePage />} />
              <Route path="projects/:id/planning" element={<PlanningPage />} />
              <Route path="projects/:id/runs" element={<RunMonitorPage />} />
              <Route path="projects/:id/board" element={<BoardPage />} />
              <Route path="projects/:id/audit" element={<AuditPage />} />
              <Route path="users" element={<UsersPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
