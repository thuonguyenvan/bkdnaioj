// RequireAuthGuard — redirects unauthenticated users to /login
// Optionally checks for a specific role; redirects to / on role mismatch
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'

interface RequireAuthGuardProps {
  children: ReactNode
  requiredRole?: 'admin' | 'jury'
}

export function RequireAuthGuard({ children, requiredRole }: RequireAuthGuardProps) {
  const { token, user } = useAuth()
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
