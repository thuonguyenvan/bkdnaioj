import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context';
import { LogOut, User as UserIcon } from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    return pathname === path || pathname.startsWith(path + '/');
  };

  const getLinkStyle = (path: string) => {
    const active = isActive(path);
    return {
      color: active ? '#ffffff' : '#94a3b8',
      fontWeight: active ? 700 : 500,
      fontSize: '0.9rem',
      textDecoration: 'none',
      padding: '0.5rem 0',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      cursor: 'pointer'
    };
  };

  return (
    <header style={{ backgroundColor: '#0f172a', height: '64px', display: 'flex', alignItems: 'center', zIndex: 100, position: 'relative' }}>
      <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        
        {/* Left Section: Logo + Navigation Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
          {/* Logo brand */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', gap: '0.5rem' }}>
            <svg viewBox="0 0 100 100" width="38" height="38" style={{ flexShrink: 0 }}>
              <circle cx="50" cy="50" r="46" fill="#ffffff" />
              <circle cx="50" cy="50" r="40" fill="none" stroke="#0b1329" strokeWidth="3.5" />
              <text x="50" y="44" textAnchor="middle" fill="#0b1329" fontSize="22" fontWeight="900" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">AI</text>
              <text x="50" y="68" textAnchor="middle" fill="#0b1329" fontSize="18" fontWeight="800" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">OLP</text>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ color: '#ffffff', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.02em', fontFamily: 'sans-serif' }}>AI OLYMPIC</span>
              <span style={{ color: '#94a3b8', fontWeight: 650, fontSize: '0.7rem', letterSpacing: '0.08em', fontFamily: 'sans-serif' }}>ONLINE JUDGE</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', position: 'relative' }}>
            <Link to="/contests" style={getLinkStyle('/contests')}>Contest</Link>
            <Link to="/problems" style={getLinkStyle('/problems')}>Problems</Link>
            <Link to="/teams" style={getLinkStyle('/teams')}>Groups</Link>
            <Link to="/rankings" style={getLinkStyle('/rankings')}>Ranking</Link>
            <Link to="/newsfeed" style={getLinkStyle('/newsfeed')}>Newsfeed</Link>
            <Link to="/docs" style={getLinkStyle('/docs')}>Docs</Link>
            
            {isAdmin && (
              <Link to="/admin/users" style={getLinkStyle('/admin/users')}>Users & Roles</Link>
            )}
            {isAdmin && (
              <Link to="/admin/contests/new" style={getLinkStyle('/admin/contests/new')}>Create Contest</Link>
            )}
            {isAdmin && (
              <Link to="/admin/workers" style={getLinkStyle('/admin/workers')}>Workers</Link>
            )}
          </nav>
        </div>

        {/* Right Section: Language & Auth Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {/* Language Selector mockup */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: '#ffffff', cursor: 'pointer', fontWeight: 500 }}>
            <span style={{ fontSize: '1rem' }}>🇻🇳</span>
            <span>English</span>
            <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>▼</span>
          </div>

          {/* User Auth controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                    {user.role}
                  </span>
                  <span className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <UserIcon size={13} style={{ color: '#94a3b8' }} />
                    {user.full_name}
                  </span>
                </div>
                <button 
                  onClick={handleLogout} 
                  className="btn btn-danger" 
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <LogOut size={13} />
                  Log out
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Link 
                  to="/login" 
                  style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', padding: '0.4rem 0.5rem' }}
                >
                  Log in
                </Link>
                <Link 
                  to="/register" 
                  style={{ border: '1px solid #ffffff', color: '#ffffff', backgroundColor: 'transparent', padding: '0.4rem 1rem', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', transition: 'all 0.15s ease' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.color = 'hsl(var(--primary))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </header>
  );
};
