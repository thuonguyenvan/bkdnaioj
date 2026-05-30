// TopNavbar — fixed top bar for public pages (homepage, leaderboard, submission)
// Max-width 1440px centered, h-16, border-b outline-variant — per Stitch homepage.html
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { Avatar } from '@/components/ui/avatar-with-initials-fallback'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export function TopNavbar() {
  const { user, logout, isAdmin } = useAuth()

  return (
    <nav className="bg-surface border-b border-outline-variant fixed top-0 left-0 right-0 w-full z-50 h-16">
      <div className="max-w-container mx-auto px-lg h-full flex items-center justify-between">
        <div className="flex items-center gap-xl">
          <Link to="/" className="text-primary font-black italic text-2xl tracking-tight font-sans">
            OLPAI
          </Link>

          <div className="hidden md:flex items-center gap-lg pt-xs">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn('text-sm font-medium transition-colors',
                  isActive ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-secondary')
              }
            >
              Home
            </NavLink>
            <a href="#contest-list" className="text-sm text-on-surface-variant hover:text-secondary transition-colors">Contests</a>
            <a href="#contest-list" className="text-sm text-on-surface-variant hover:text-secondary transition-colors">Leaderboard</a>
            <a href="#" className="text-sm text-on-surface-variant hover:text-secondary transition-colors">Docs</a>
          </div>
        </div>

        {/* Auth area */}
        <div className="flex items-center gap-md">
          {user ? (
            <>
              {isAdmin && (
                <Link to="/admin/contests/new">
                  <Button variant="outline" size="sm">Admin</Button>
                </Link>
              )}
              <Avatar name={user.full_name || user.email} size="sm" />
              <span className="text-sm text-on-surface-variant">{user.full_name || user.email}</span>
              <Button variant="ghost" size="sm" onClick={logout}>
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="sm">Join Contest</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
