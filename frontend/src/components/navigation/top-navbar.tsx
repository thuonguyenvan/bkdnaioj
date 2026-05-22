import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context';
import { useQuery } from '@tanstack/react-query';
import { api, type Contest } from '../../lib/api-client';
import { Code2, LogOut, User as UserIcon, Settings, Search } from 'lucide-react';

export const TopNavbar: React.FC = () => {
  const { user, logout, isAdmin, isJury } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Query contests to know which contest/phase is active
  const { data: contests = [] } = useQuery<Contest[]>({
    queryKey: ['contests'],
    queryFn: api.getContests,
    enabled: !!user,
  });

  const activeContests = contests.filter(c => {
    const start = new Date(c.start_time);
    const end = new Date(c.end_time);
    const now = new Date();
    return c.status !== 'draft' && now >= start && now <= end;
  });

  const upcomingContests = contests.filter(c => {
    const start = new Date(c.start_time);
    const now = new Date();
    return c.status !== 'draft' && now < start;
  });

  const targetContest = activeContests[0] || upcomingContests[0] || contests[0];
  const activeContestId = targetContest?.id;

  // Check if current page is inside a contest phase
  const phaseMatch = pathname.match(/^\/contests\/([^/]+)\/phases\/([^/]+)/);

  const getNavLink = (tabType: 'problems' | 'contests' | 'status' | 'rankings' | 'discussions') => {
    if (phaseMatch) {
      const cId = phaseMatch[1];
      const pKey = phaseMatch[2];
      if (tabType === 'problems') return `/contests/${cId}/phases/${pKey}?tab=problems`;
      if (tabType === 'contests') return '/?scroll=contests';
      if (tabType === 'status') return `/contests/${cId}/phases/${pKey}?tab=submissions`;
      if (tabType === 'rankings') return `/contests/${cId}/phases/${pKey}?tab=standings`;
      if (tabType === 'discussions') return `/contests/${cId}/phases/${pKey}?tab=clarifications`;
    } else {
      if (tabType === 'problems') return '/?scroll=exercises';
      if (tabType === 'contests') return '/?scroll=contests';
      if (activeContestId) {
        if (tabType === 'status') return `/contests/${activeContestId}/phases/public_test?tab=submissions`;
        if (tabType === 'rankings') return `/contests/${activeContestId}/phases/public_test?tab=standings`;
        if (tabType === 'discussions') return `/contests/${activeContestId}/phases/public_test?tab=clarifications`;
      } else {
        return '/?scroll=contests';
      }
    }
    return '/';
  };

  return (
    <header className="navbar" style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', boxShadow: 'none', height: '64px' }}>
      <div className="container flex justify-between items-center">
        <div className="flex items-center gap-8">
          <Link to="/" className="navbar-brand" style={{ gap: '0.4rem', color: '#0f172a', fontWeight: 800, fontSize: '1.35rem' }}>
            <Code2 size={24} style={{ color: '#2563eb' }} />
            Uni<span>OJ</span>
          </Link>
          
          <nav className="navbar-links" style={{ gap: '1.75rem' }}>
            <Link to={getNavLink('problems')} className="navbar-item" style={{ color: '#64748b' }}>Problems</Link>
            <Link to={getNavLink('contests')} className="navbar-item" style={{ color: '#0f172a', fontWeight: 600 }}>Contests</Link>
            <Link to={getNavLink('status')} className="navbar-item" style={{ color: '#64748b' }}>Status</Link>
            <Link to={getNavLink('rankings')} className="navbar-item" style={{ color: '#64748b' }}>Rankings</Link>
            <Link to={getNavLink('discussions')} className="navbar-item" style={{ color: '#64748b' }}>Discussions</Link>
            <Link to="/teams" className="navbar-item" style={{ color: '#64748b' }}>Groups</Link>
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
                {(isAdmin || isJury) && (
                  <Link to="/admin" className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                    <Settings size={14} />
                    Admin Panel
                  </Link>
                )}
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
