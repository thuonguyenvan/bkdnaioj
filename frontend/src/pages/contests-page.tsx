import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';
import { api, type Contest, type ContestEntry } from '../lib/api-client';

const CountdownTicker: React.FC<{ endTime: string }> = ({ endTime }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateCountdown = () => {
      const difference = new Date(endTime).getTime() - Date.now();
      if (difference <= 0) {
        setTimeLeft('Ended');
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
  }, [endTime]);

  return <span style={{ color: '#ef4444', fontWeight: 600 }}>{timeLeft}</span>;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDuration = (startValue: string, endValue: string) => {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  const diffMs = end - start;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return '-';

  const totalMinutes = Math.round(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

const getEntryPolicyLabel = (policy: Contest['entry_policy']) => {
  switch (policy) {
    case 'individual':
      return 'Individual';
    case 'team':
      return 'Team';
    case 'both':
      return 'Indiv. & Team';
    default:
      return policy;
  }
};

type ContestSection = 'running' | 'upcoming' | 'ended';

export const ContestsPage: React.FC = () => {
  const { data: contests = [], isLoading, error } = useQuery<Contest[]>({
    queryKey: ['contests'],
    queryFn: api.getContests,
  });

  const publicContests = useMemo(
    () => contests.filter((contest) => contest.status !== 'draft' && contest.visibility === 'public'),
    [contests]
  );

  const { data: entryCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['contest-entry-counts', publicContests.map((contest) => contest.id).join(',')],
    queryFn: async () => {
      const pairs = await Promise.all(
        publicContests.map(async (contest) => {
          try {
            const entries = await api.getEntries(contest.id);
            const officialEntries = entries.filter((entry: ContestEntry) => entry.entry_mode === 'official');
            return [contest.id, officialEntries.length] as const;
          } catch (err) {
            console.error(`Failed to load entries for contest ${contest.id}`, err);
            return [contest.id, -1] as const;
          }
        })
      );
      return Object.fromEntries(pairs);
    },
    enabled: publicContests.length > 0,
  });

  const groupedContests = useMemo(() => {
    const now = Date.now();
    const sorted = [...publicContests].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    const hasEnded = (contest: Contest) => {
      const end = new Date(contest.end_time).getTime();
      return contest.status === 'ended' || contest.status === 'archived' || (Number.isFinite(end) && now > end);
    };

    const running = sorted.filter((contest) => {
      if (hasEnded(contest)) return false;
      const start = new Date(contest.start_time).getTime();
      const end = new Date(contest.end_time).getTime();
      return contest.status === 'running' || (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end);
    });
    const runningIds = new Set(running.map((contest) => contest.id));

    const upcoming = sorted.filter((contest) => {
      if (runningIds.has(contest.id)) return false;
      if (hasEnded(contest)) return false;
      const start = new Date(contest.start_time).getTime();
      return contest.status === 'registration_open' || (Number.isFinite(start) && now < start);
    });
    const upcomingIds = new Set(upcoming.map((contest) => contest.id));

    return {
      running,
      upcoming,
      ended: sorted
        .filter((contest) => {
          if (runningIds.has(contest.id) || upcomingIds.has(contest.id)) return false;
          return hasEnded(contest);
        })
        .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime()),
    };
  }, [publicContests]);

  const renderContestSection = (title: string, list: Contest[], statusType: ContestSection) => {
    if (list.length === 0) return null;

    const isRunning = statusType === 'running';
    const isUpcoming = statusType === 'upcoming';
    const isEnded = statusType === 'ended';

    return (
      <div className="table-section">
        <h2 className="section-heading">{title}</h2>

        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="oj-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col />                              {/* Contest Name — flexible */}
                <col style={{ width: 160 }} />       {/* Start */}
                <col style={{ width: 90 }} />        {/* Duration */}
                <col style={{ width: 120 }} />       {/* Type */}
                <col style={{ width: 170 }} />       {/* Last col (Ends In / Registration / Ended) */}
                {(isRunning || isUpcoming) && <col style={{ width: 110 }} />}  {/* Action */}
              </colgroup>
              <thead>
                <tr>
                  <th>Contest Name</th>
                  <th>Start</th>
                  <th>Duration</th>
                  <th>Type</th>
                  {isUpcoming && <th>Registration</th>}
                  {isUpcoming && <th style={{ textAlign: 'right' }}>Action</th>}
                  {isRunning && <th>Ends In</th>}
                  {isRunning && <th style={{ textAlign: 'right' }}>Action</th>}
                  {isEnded && <th>Ended</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((contest) => {
                  const count = entryCounts[contest.id];
                  return (
                    <tr key={contest.id}>
                      <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Link to={`/contests/${contest.id}`} style={{ color: 'hsl(var(--primary))', textDecoration: 'none', fontWeight: 600 }}>
                          {contest.title}
                        </Link>
                      </td>
                      <td className="font-mono" style={{ color: '#334155', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {formatDateTime(contest.start_time)}
                      </td>
                      <td style={{ color: '#334155', whiteSpace: 'nowrap' }}>
                        {formatDuration(contest.start_time, contest.end_time)}
                      </td>
                      <td>
                        <span className="badge badge-secondary" style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {getEntryPolicyLabel(contest.entry_policy)}
                        </span>
                      </td>
                      {isUpcoming && (
                        <>
                          <td className="font-mono" style={{ color: '#334155', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                            {count === undefined ? '—' : count < 0 ? '—' : `${count} ${contest.entry_policy === 'team' ? 'teams' : 'contestants'}`}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Link to={`/contests/${contest.id}`} className="btn btn-secondary btn-sm">Register</Link>
                          </td>
                        </>
                      )}
                      {isRunning && (
                        <>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <CountdownTicker endTime={contest.end_time} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Link to={`/contests/${contest.id}`} className="btn btn-primary btn-sm">Enter</Link>
                          </td>
                        </>
                      )}
                      {isEnded && (
                        <td className="font-mono" style={{ color: '#334155', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {formatDateTime(contest.end_time)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      <div className="page-header">
        <h1 className="page-title">Contest</h1>
        <p className="page-subtitle">
          Track upcoming, running, and completed contests on AI Olympic Online Judge.
        </p>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
          <div className="spinner"></div>
          <p style={{ marginTop: '1rem', color: 'hsl(var(--text-muted))' }}>Loading contest list...</p>
        </div>
      )}

      {!isLoading && error && (
        <div className="alert alert-danger">
          Could not connect to the server to load contests. Please check your connection.
        </div>
      )}

      {!isLoading && !error && publicContests.length === 0 && (
        <div className="panel flex flex-col items-center justify-center text-center" style={{ padding: '4rem 2rem' }}>
          <Calendar size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
          <h3 style={{ margin: 0, color: '#475569' }}>No contests yet</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            No contests have been published yet. Please check back later.
          </p>
        </div>
      )}

      {!isLoading && !error && publicContests.length > 0 && (
        <>
          {renderContestSection('Running', groupedContests.running, 'running')}
          {renderContestSection('Upcoming', groupedContests.upcoming, 'upcoming')}
          {renderContestSection('Completed', groupedContests.ended, 'ended')}
        </>
      )}
    </div>
  );
};
