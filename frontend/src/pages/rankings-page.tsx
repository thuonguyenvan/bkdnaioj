import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type PhaseDef } from '../lib/api-client';
import { Trophy, Medal, Users, Search, ChevronDown, ChevronUp } from 'lucide-react';

type RankingPhaseKey = PhaseDef['key'];

interface StandingUser {
  displayName: string;
  fullName: string;
  totalScore: number;
  taskCount: number;
  details: { contestTitle: string; phaseTitle: string; taskTitle: string; score: number }[];
}

const RANKING_PHASES: Array<{ key: RankingPhaseKey; label: string }> = [
  { key: 'public_test', label: 'Public Test' },
  { key: 'final_public', label: 'Final Public' },
  { key: 'private_test', label: 'Private Test' },
  { key: 'final_private', label: 'Final Private' },
];

const getRankingPhaseLabel = (key: RankingPhaseKey) =>
  RANKING_PHASES.find(phase => phase.key === key)?.label || key.replace(/_/g, ' ');

export const RankingsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [activePhaseKey, setActivePhaseKey] = useState<RankingPhaseKey>('public_test');

  // Backend aggregates global rankings by phase, avoiding frontend N+1 leaderboard scans.
  const { data: rankingsByPhase = {}, isLoading: loadingStandings, error } = useQuery<Partial<Record<RankingPhaseKey, StandingUser[]>>>({
    queryKey: ['global-rankings'],
    queryFn: async () => {
      const pairs = await Promise.all(
        RANKING_PHASES.map(async ({ key }) => {
          const rows = await api.getGlobalRanking(key);
          return [key, rows.map(row => {
            const totalScore = Number(row.total_score);
            return {
              displayName: row.display_name,
              fullName: row.full_name,
              totalScore: Number.isFinite(totalScore) ? totalScore : 0,
              taskCount: row.task_count,
              details: row.details.map(detail => {
                const score = Number(detail.score);
                return {
                  contestTitle: detail.contest_title,
                  phaseTitle: getRankingPhaseLabel(key),
                  taskTitle: detail.task_title,
                  score: Number.isFinite(score) ? score : 0,
                };
              }),
            };
          })] as const;
        })
      );

      return pairs.reduce<Partial<Record<RankingPhaseKey, StandingUser[]>>>((acc, [key, rows]) => {
        acc[key] = rows;
        return acc;
      }, {});
    },
  });

  const isLoading = loadingStandings;

  // Filter rankings by user display name
  const standings = rankingsByPhase[activePhaseKey] || [];
  const activePhaseLabel = RANKING_PHASES.find(phase => phase.key === activePhaseKey)?.label || 'Ranking';

  const filteredStandings = standings.filter(s => 
    s.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: '50%', width: '28px', height: '28px' }}>
          <Trophy size={16} />
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e2e8f0', color: '#475569', borderRadius: '50%', width: '28px', height: '28px' }}>
          <Medal size={16} style={{ color: '#94a3b8' }} />
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffedd5', color: '#ea580c', borderRadius: '50%', width: '28px', height: '28px' }}>
          <Medal size={16} style={{ color: '#c2410c' }} />
        </span>
      );
    }
    return <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#64748b', paddingLeft: '6px' }}>{rank}</span>;
  };

  const toggleExpandUser = (name: string) => {
    if (expandedUser === name) {
      setExpandedUser(null);
    } else {
      setExpandedUser(name);
    }
  };

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      <div className="page-header">
        <h1 className="page-title">Global Ranking</h1>
        <p className="page-subtitle">
          Raw-score rankings across contests, separated by contest phase. Each task contributes the contestant's best score across all participation modes.
        </p>
      </div>

      <div className="panel toolbar-panel-stacked">
        <div className="toolbar-row">
          <div className="flex flex-wrap gap-2">
            {RANKING_PHASES.map(phase => (
              <button
                key={phase.key}
                type="button"
                onClick={() => {
                  setActivePhaseKey(phase.key);
                  setExpandedUser(null);
                }}
                className={`btn btn-sm ${activePhaseKey === phase.key ? 'btn-primary' : 'btn-secondary'}`}
              >
                {phase.label}
                <span className={`badge ${activePhaseKey === phase.key ? 'badge-secondary' : 'badge-info'}`} style={{ marginLeft: '0.35rem', fontSize: '0.65rem' }}>
                  {(rankingsByPhase[phase.key] || []).length}
                </span>
              </button>
            ))}
          </div>

          <div className="toolbar-meta">
            Showing <strong>{filteredStandings.length}</strong> contestants
          </div>
        </div>

        <div className="search-field">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search contestant..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
          <div className="spinner"></div>
          <p style={{ marginTop: '1rem', color: 'hsl(var(--text-muted))' }}>Computing rankings...</p>
        </div>
      )}

      {!isLoading && error && (
        <div className="alert alert-danger">
          Could not compute global rankings. Please try again later.
        </div>
      )}

      {!isLoading && !error && filteredStandings.length === 0 && (
        <div className="panel empty-state">
          <Users size={48} />
          <h3>No ranking data found</h3>
          <p>
            There are no raw-score results for {activePhaseLabel}, or no contestants match the current search.
          </p>
        </div>
      )}

      {!isLoading && !error && filteredStandings.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="oj-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Rank</th>
                  <th>Contestant</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Tasks</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>Raw Score</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredStandings.map((user, idx) => {
                  const rank = idx + 1;
                  const isExpanded = expandedUser === user.displayName;

                  return (
                    <React.Fragment key={user.displayName}>
                      <tr 
                        style={{ 
                          borderBottom: isExpanded ? 'none' : undefined, 
                          cursor: 'pointer'
                        }}
                        onClick={() => toggleExpandUser(user.displayName)}
                      >
                        <td>
                          {getRankBadge(rank)}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{user.displayName}</div>
                          {user.fullName && (
                            <div className="font-mono" style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                              {user.fullName}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', color: '#475569' }}>
                          <span className="metric-pill">{user.taskCount}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="font-mono" style={{ color: 'hsl(var(--primary))', fontWeight: 800 }}>
                            {user.totalScore.toLocaleString()}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', color: '#94a3b8' }}>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </td>
                      </tr>
                      
                      {isExpanded && (
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <td colSpan={5} style={{ padding: '1rem 2rem' }}>
                            <div style={{ borderLeft: '3px solid #cbd5e1', paddingLeft: '1rem' }}>
                              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#475569', fontWeight: 700 }}>Best raw score by task:</h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {user.details.map((detail, dIdx) => (
                                  <div key={dIdx} className="flex justify-between items-center" style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '450px' }}>
                                    <span>{detail.contestTitle} · {detail.phaseTitle} · {detail.taskTitle}</span>
                                    <span style={{ fontWeight: 600, color: '#334155', fontFamily: 'monospace' }}>+{detail.score.toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
