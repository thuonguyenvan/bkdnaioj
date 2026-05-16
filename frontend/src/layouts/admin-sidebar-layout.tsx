// AdminSidebarLayout — layout for admin-only pages, enforces admin role guard
// Fixed admin sidebar (w-64 left) + main area offset ml-64
import { Outlet } from 'react-router-dom'
import { RequireAuthGuard } from '@/components/auth/require-auth-guard'
import { AdminSidebarNav } from '@/components/navigation/admin-sidebar-nav'

export function AdminSidebarLayout() {
  return (
    <RequireAuthGuard requiredRole="admin">
      <div className="min-h-screen bg-background">
        <AdminSidebarNav />
        <main className="ml-64 min-h-screen">
          <Outlet />
        </main>
      </div>
    </RequireAuthGuard>
  )
}
