import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context';
import { Code2, LogOut, User as UserIcon, Search } from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Active tab helper based on pathname prefix
  const isActive = (path: string) => {
    return pathname.startsWith(path);
  };

  const getLinkStyle = (path: string) => {
    const active = isActive(path);
    return {
      color: active ? '#2563eb' : '#64748b',
      fontWeight: active ? 600 : 500,
      borderBottom: active ? '2px solid #2563eb' : 'none',
      paddingBottom: '0.25rem'
    };
  };

  return (
    <header className="navbar" style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', boxShadow: 'none', height: '64px' }}>
      <div className="container flex justify-between items-center">
        <div className="flex items-center gap-8">
          <Link to="/" className="navbar-brand" style={{ gap: '0.4rem', color: '#0f172a', fontWeight: 800, fontSize: '1.35rem' }}>
            <Code2 size={24} style={{ color: '#2563eb' }} />
            BKDNAIOJ<span></span>
          </Link>

          <nav className="navbar-links" style={{ gap: '1.75rem', display: 'flex', alignItems: 'center' }}>
            <Link to="/newsfeed" className="navbar-item" style={getLinkStyle('/newsfeed')}>Newsfeed</Link>
            <Link to="/problems" className="navbar-item" style={getLinkStyle('/problems')}>Problems</Link>
            <Link to="/contests" className="navbar-item" style={getLinkStyle('/contests')}>Contests</Link>
            <Link to="/rankings" className="navbar-item" style={getLinkStyle('/rankings')}>Rankings</Link>
            <Link to="/teams" className="navbar-item" style={getLinkStyle('/teams')}>Groups</Link>
            {isAdmin && (
              <Link to="/admin/users" className="navbar-item" style={getLinkStyle('/admin/users')}>Users & Roles</Link>
            )}
            {isAdmin && (
              <Link to="/admin/contests/new" className="navbar-item" style={getLinkStyle('/admin/contests/new')}>Create Contest</Link>
            )}
            {isAdmin && (
              <Link to="/admin/workers" className="navbar-item" style={getLinkStyle('/admin/workers')}>Workers</Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-6">
          {/* Search problems bar */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '240px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search problems..."
              style={{
                paddingLeft: '32px',
                paddingRight: '12px',
                height: '36px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                fontSize: '0.825rem',
                width: '100%',
                backgroundColor: '#f8fafc',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <>

                <div className="flex items-center gap-2">
                  <div className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                    {user.role}
                  </div>
                  <div className="flex items-center gap-1 font-mono" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    <UserIcon size={14} className="text-muted" />
                    {user.full_name}
                  </div>
                </div>
                <button onClick={handleLogout} className="btn btn-danger flex items-center gap-1" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                  <LogOut size={14} />
                  Logout
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <Link to="/login" className="btn btn-secondary" style={{ border: '1px solid #cbd5e1', color: '#0f172a', padding: '0.45rem 1rem', borderRadius: '6px' }}>Sign in</Link>
                <Link to="/register" className="btn btn-primary" style={{ backgroundColor: '#2563eb', padding: '0.45rem 1rem', borderRadius: '6px' }}>Register</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
