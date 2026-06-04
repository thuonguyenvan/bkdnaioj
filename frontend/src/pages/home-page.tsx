import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Globe2, Megaphone, Pin, Trophy } from 'lucide-react';
import { api, type Announcement, type Contest } from '../lib/api-client';

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getEntryPolicyText = (policy: Contest['entry_policy']) => {
  switch (policy) {
    case 'individual':
      return 'Individual';
    case 'team':
      return 'Team';
    case 'both':
      return 'Individual & Team';
    default:
      return policy;
  }
};

const CountdownText: React.FC<{ targetTime: string; fallback?: string }> = ({ targetTime, fallback = 'Started' }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateCountdown = () => {
      const difference = new Date(targetTime).getTime() - Date.now();
      if (!Number.isFinite(difference) || difference <= 0) {
        setTimeLeft(fallback);
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);
      const pad = (n: number) => n.toString().padStart(2, '0');

      setTimeLeft(`${days > 0 ? `${days}d ` : ''}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [fallback, targetTime]);

  return <>{timeLeft}</>;
};

export const HomePage: React.FC = () => {
  const [clockString, setClockString] = useState('');

  const { data: contests = [], isLoading: loadingContests } = useQuery<Contest[]>({
    queryKey: ['contests'],
    queryFn: api.getContests,
  });

  const { data: announcements = [], isLoading: loadingAnnouncements } = useQuery<Announcement[]>({
    queryKey: ['system-announcements'],
    queryFn: api.getSystemAnnouncements,
    retry: false,
  });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const year = now.getFullYear();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const seconds = now.getSeconds().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      setClockString(`${month}/${day}/${year}, ${hours}:${minutes}:${seconds} ${ampm}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now();
  const publicContests = contests.filter((contest) => contest.status !== 'draft' && contest.visibility === 'public');
  const upcomingContest = [...publicContests]
    .filter((contest) => new Date(contest.start_time).getTime() > now || contest.status === 'registration_open')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
  const recentContests = [...publicContests]
    .filter((contest) => contest.status === 'ended' || contest.status === 'archived' || new Date(contest.end_time).getTime() < now)
    .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime())
    .slice(0, 5);
  const visibleAnnouncements = [...announcements]
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 2);

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.25rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="badge badge-secondary" style={{ gap: '0.35rem' }}>
            <Globe2 size={14} />
            Global
          </span>
        </div>
        
        <div style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '0.85rem',
          color: '#475569',
          fontWeight: 500
        }}>
          {clockString}
        </div>
      </div>

      <div className="table-section">
        <h2 className="section-heading">
          <CalendarDays size={16} />
          Upcoming Contest
        </h2>
        
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '1rem 1.25rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          {loadingContests ? (
            <div className="text-muted" style={{ fontSize: '0.875rem' }}>Loading contests...</div>
          ) : upcomingContest ? (
            <>
              <div style={{ flex: '1 1 360px' }}>
                <Link to={`/contests/${upcomingContest.id}`} style={{ color: 'hsl(var(--primary))', fontWeight: 700, fontSize: '0.925rem', textDecoration: 'none' }}>
                  {upcomingContest.title}
                </Link>
                <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                  {getEntryPolicyText(upcomingContest.entry_policy)}
                </div>
              </div>

              <div style={{ minWidth: '180px', textAlign: 'center' }}>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Starts in</div>
                <div style={{ color: 'hsl(var(--primary))', fontWeight: 700, fontSize: '1.1rem', margin: '0.1rem 0' }}>
                  <CountdownText targetTime={upcomingContest.start_time} />
                </div>
                <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{formatDateTime(upcomingContest.start_time)}</div>
              </div>

              <div style={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>
                <span className="badge badge-secondary">{upcomingContest.status.replace(/_/g, ' ')}</span>
              </div>

              <div style={{ flex: '0 0 auto' }}>
                <Link to={`/contests/${upcomingContest.id}`} className="btn btn-secondary btn-sm">
                  Register
                </Link>
              </div>
            </>
          ) : (
            <div className="text-muted" style={{ fontSize: '0.875rem' }}>No upcoming contests.</div>
          )}
        </div>
        
        <div style={{ textAlign: 'right', marginTop: '0.2rem' }}>
          <Link to="/contests" style={{ color: 'hsl(var(--primary))', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 500 }}>
            View all upcoming contests »
          </Link>
        </div>
      </div>

      <div className="table-section">
        <h2 className="section-heading">
          <Megaphone size={16} />
          Announcements
        </h2>

        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          overflow: 'hidden'
        }}>
          {loadingAnnouncements ? (
            <div className="text-muted" style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>Loading announcements...</div>
          ) : visibleAnnouncements.length === 0 ? (
            <div className="text-muted" style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>No announcements yet.</div>
          ) : visibleAnnouncements.map((item, index) => (
            <div key={item.id} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.65rem 1rem',
              borderBottom: index === visibleAnnouncements.length - 1 ? 'none' : '1px solid #f1f5f9',
              fontSize: '0.825rem'
            }}>
              <div style={{ width: '100px', color: '#64748b', fontFamily: 'var(--font-sans)' }}>
                {formatDate(item.created_at)}
              </div>
              <div style={{ flexGrow: 1, color: '#334155', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Link to="/newsfeed" style={{ color: '#334155', textDecoration: 'none' }}>
                  {item.title}
                </Link>
                {item.is_pinned && (
                  <span className="badge badge-primary" style={{ fontSize: '0.65rem', padding: '0.12rem 0.35rem' }} title="Pinned">
                    <Pin size={12} fill="currentColor" />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'right', marginTop: '0.2rem' }}>
          <Link to="/newsfeed" style={{ color: 'hsl(var(--primary))', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 500 }}>
            View all announcements »
          </Link>
        </div>
      </div>

      <div className="table-section">
        <h2 className="section-heading">
          <Trophy size={16} />
          Recent Contests
        </h2>

        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          overflow: 'hidden'
        }}>
          {loadingContests ? (
            <div className="text-muted" style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>Loading recent contests...</div>
          ) : recentContests.length === 0 ? (
            <div className="text-muted" style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>No completed contests yet.</div>
          ) : recentContests.map((item, index) => (
            <div key={item.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.65rem 1rem',
              borderBottom: index === recentContests.length - 1 ? 'none' : '1px solid #f1f5f9',
              fontSize: '0.825rem'
            }}>
              <div style={{ flexGrow: 1 }}>
                <Link to={`/contests/${item.id}`} style={{ color: 'hsl(var(--primary))', fontWeight: 600, textDecoration: 'none' }}>
                  {item.title}
                </Link>
              </div>
              <div style={{ display: 'flex', gap: '2rem', color: '#64748b' }}>
                <div>{item.status.replace(/_/g, ' ')}</div>
                <div style={{ width: '110px', textAlign: 'right' }}>{formatDate(item.end_time)}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'right', marginTop: '0.2rem', marginBottom: '0.5rem' }}>
          <Link to="/contests" style={{ color: 'hsl(var(--primary))', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 500 }}>
            View all completed contests »
          </Link>
        </div>
      </div>

    </div>
  );
};
