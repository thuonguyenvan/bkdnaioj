import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Contest, type PhaseDef, type LeaderboardRow } from '../lib/api-client';
import { Trophy, Medal, Users, Search, ChevronDown, ChevronUp } from 'lucide-react';

type RankingPhaseKey = PhaseDef['key'];

interface StandingUser {
  displayName: string;
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

  // Fetch all contests
  const { data: contests = [], isLoading: loadingContests } = useQuery<Contest[]>({
    queryKey: ['contests'],
    queryFn: api.getContests,
  });

  // Fetch task leaderboards for all contests, aggregating each user's best raw score per task.
  const { data: rankingsByPhase = {}, isLoading: loadingStandings, error } = useQuery<Partial<Record<RankingPhaseKey, StandingUser[]>>>({
    queryKey: ['global-rankings', contests.map(c => c.id).join(',')],
    queryFn: async () => {
      if (contests.length === 0) return {};
      
      const phaseScores: Record<RankingPhaseKey, { [username: string]: { totalScore: number; taskCount: number; details: { contestTitle: string; phaseTitle: string; taskTitle: string; score: number }[] } }> = {
        public_test: {},
        private_test: {},
        final_public: {},
        final_private: {},
      };

      const usernamesForRow = (row: LeaderboardRow) => {
        if (row.user_emails && row.user_emails.length > 0) {
          return Array.from(new Set(row.user_emails.map(email => email.split('@')[0])));
        }
        if (row.display_name) {
          return [row.display_name.includes('@') ? row.display_name.split('@')[0] : row.display_name];
        }
        return [];
      };

      await Promise.all(
        contests.map(async (contest) => {
          try {
            // Only pull standings for published contests (running/ended/archived)
            if (contest.status === 'draft') return;

            const phaseDefs = await api.getPhaseDefs(contest.id);
            if (phaseDefs.length === 0) return;
            const tasks = await api.getTasks(contest.id);
            if (tasks.length === 0) return;

            const phasesByTask = await Promise.all(
              tasks.map(async task => {
                try {
                  const phases = await api.getPhasesByTask(task.id);
                  return { task, phases };
                } catch (e) {
                  console.error(`Failed to load phases for task ${task.id}`, e);
                  return { task, phases: [] };
                }
              })
            );
            
            await Promise.all(
              RANKING_PHASES.map(async ({ key }) => {
                const targetDef = phaseDefs.find(d => d.key === key);
                if (!targetDef) return;

                await Promise.all(
                  phasesByTask.map(async ({ task, phases }) => {
                    const phase = phases.find(item => item.contest_phase_def_id === targetDef.id);
                    if (!phase) return;

                    const leaderboard = await api.getTaskPhaseLeaderboard(phase.id);
                    const bestScoreByUser = new Map<string, number>();

                    leaderboard.forEach(row => {
                      const rawScore = Number(row.raw_score !== undefined ? row.raw_score : row.score || 0);
                      const safeScore = Number.isFinite(rawScore) ? rawScore : 0;
                      usernamesForRow(row).forEach(username => {
                        const current = bestScoreByUser.get(username);
                        if (current === undefined || safeScore > current) {
                          bestScoreByUser.set(username, safeScore);
                        }
                      });
                    });

                    bestScoreByUser.forEach((score, username) => {
                      if (!phaseScores[key][username]) {
                        phaseScores[key][username] = {
                          totalScore: 0,
                          taskCount: 0,
                          details: []
                        };
                      }
                      phaseScores[key][username].totalScore += score;
                      phaseScores[key][username].taskCount += 1;
                      phaseScores[key][username].details.push({
                        contestTitle: contest.title,
                        phaseTitle: getRankingPhaseLabel(targetDef.key),
                        taskTitle: task.title,
                        score
                      });
                    });
                  })
                );
              })
            );
          } catch (e) {
            console.error(`Failed to load standings for contest ${contest.id}`, e);
          }
        })
      );

      return RANKING_PHASES.reduce<Partial<Record<RankingPhaseKey, StandingUser[]>>>((acc, { key }) => {
        acc[key] = Object.entries(phaseScores[key])
          .map(([name, data]) => ({
            displayName: name,
            totalScore: data.totalScore,
            taskCount: data.taskCount,
            details: data.details
          }))
          .sort((a, b) => b.totalScore - a.totalScore);
        return acc;
      }, {});
    },
    enabled: contests.length > 0,
  });

  const isLoading = loadingContests || (contests.length > 0 && loadingStandings);

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
