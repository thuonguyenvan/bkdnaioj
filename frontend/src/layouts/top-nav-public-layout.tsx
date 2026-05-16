// TopNavPublicLayout — layout shell for public pages (homepage, leaderboard)
// Renders fixed TopNavbar + full-height Outlet with pt-16 to clear navbar
import { Outlet } from 'react-router-dom'
import { TopNavbar } from '@/components/navigation/top-navbar'

export function TopNavPublicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <TopNavbar />
      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  )
}
