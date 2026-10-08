import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Gates child routes behind authentication; redirects to /login otherwise. */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
