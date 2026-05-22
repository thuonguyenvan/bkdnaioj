import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Contest } from '../lib/api-client';
import { Trophy, Medal, Users, Search, ChevronDown, ChevronUp } from 'lucide-react';

interface StandingUser {
  displayName: string;
  totalScore: number;
  contestCount: number;
  details: { contestTitle: string; score: number }[];
}

export const RankingsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Fetch all contests
  const { data: contests = [], isLoading: loadingContests } = useQuery<Contest[]>({
    queryKey: ['contests'],
    queryFn: api.getContests,
  });

  // Fetch phase definitions and leaderboards for all contests, aggregating scores
  const { data: standings = [], isLoading: loadingStandings, error } = useQuery<StandingUser[]>({
    queryKey: ['global-rankings', contests.map(c => c.id).join(',')],
    queryFn: async () => {
      if (contests.length === 0) return [];
      
      const userScores: { [username: string]: { totalScore: number; contestCount: number; details: { contestTitle: string; score: number }[] } } = {};

      await Promise.all(
        contests.map(async (contest) => {
          try {
            // Only pull standings for published contests (running/ended/archived)
            if (contest.status === 'draft') return;

            const phaseDefs = await api.getPhaseDefs(contest.id);
            if (phaseDefs.length === 0) return;
            
            // Target the public_test phase def or fall back to the first defined phase
            const targetDef = phaseDefs.find(d => d.key === 'public_test') || phaseDefs[0];
            if (!targetDef) return;

            const leaderboard = await api.getContestPhaseLeaderboard(contest.id, targetDef.id);
            leaderboard.forEach(row => {
              // Extract raw score (use raw_score, fallback to score)
              const rawScore = Number(row.raw_score !== undefined ? row.raw_score : row.score || 0);

              // Get list of usernames for this row
              let usernames: string[] = [];
              if (row.user_emails && row.user_emails.length > 0) {
                usernames = row.user_emails.map(email => email.split('@')[0]);
              } else if (row.display_name) {
                const fallbackUsername = row.display_name.includes('@') ? row.display_name.split('@')[0] : row.display_name;
                usernames = [fallbackUsername];
              }

              // Deduplicate usernames in case the same user is listed multiple times (failsafe)
              const uniqueUsernames = Array.from(new Set(usernames));

              uniqueUsernames.forEach(username => {
                if (!userScores[username]) {
                  userScores[username] = {
                    totalScore: 0,
                    contestCount: 0,
                    details: []
                  };
                }
                userScores[username].totalScore += rawScore;
                userScores[username].contestCount += 1;
                userScores[username].details.push({
                  contestTitle: contest.title,
                  score: rawScore
                });
              });
            });
          } catch (e) {
            console.error(`Failed to load standings for contest ${contest.id}`, e);
          }
        })
      );

      return Object.entries(userScores)
        .map(([name, data]) => ({
          displayName: name,
          totalScore: data.totalScore,
          contestCount: data.contestCount,
          details: data.details
        }))
        .sort((a, b) => b.totalScore - a.totalScore);
    },
    enabled: contests.length > 0,
  });

  const isLoading = loadingContests || (contests.length > 0 && loadingStandings);

  // Filter rankings by user display name
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
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '4rem' }}>
      
      {/* Header Banner */}
      <div className="home-banner" style={{ minHeight: '160px', padding: '2rem 3rem', marginBottom: '2.5rem' }}>
        <div className="home-banner-grid-bg"></div>
        <div className="home-banner-glow"></div>
        
        <div className="home-banner-content">
          <span className="home-banner-badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' }}>Bảng Xếp Hạng Hệ Thống</span>
          <h1 className="home-banner-title" style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Bảng Xếp Hạng Tổng</h1>
          <p className="home-banner-subtitle" style={{ fontSize: '1rem', opacity: 0.9 }}>
            Thứ hạng danh giá của tất cả đấu thủ trên toàn bộ hệ thống tính bằng tổng điểm mọi bài tập đã vượt qua.
          </p>
        </div>
        
        <div style={{ position: 'absolute', right: '5%', bottom: '10%', opacity: 0.15, pointerEvents: 'none' }}>
          <Trophy size={120} color="#ffffff" />
        </div>
      </div>

      {/* Control bar */}
      <div className="panel flex justify-between items-center" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', maxWidth: '380px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Tìm tên người chơi..."
            style={{
              paddingLeft: '38px',
              paddingRight: '12px',
              height: '40px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              fontSize: '0.875rem',
              width: '100%',
              backgroundColor: '#f8fafc',
              outline: 'none',
            }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
          Đang hiển thị <strong>{filteredStandings.length}</strong> thí sinh
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
          <div className="spinner"></div>
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Đang tính toán thứ hạng tổng hợp...</p>
        </div>
      )}

      {!isLoading && error && (
        <div className="alert alert-danger">
          Không thể tính toán bảng xếp hạng hệ thống. Vui lòng thử lại sau.
        </div>
      )}

      {!isLoading && !error && filteredStandings.length === 0 && (
        <div className="panel flex flex-col items-center justify-center text-center" style={{ padding: '4rem 2rem' }}>
          <Users size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
          <h3 style={{ margin: 0, color: '#475569' }}>Không tìm thấy dữ liệu xếp hạng</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Hiện chưa có thí sinh nào ghi nhận điểm số chính thức trên hệ thống hoặc không có kết quả khớp.
          </p>
        </div>
      )}

      {!isLoading && !error && filteredStandings.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 600, fontSize: '0.85rem', width: '80px' }}>THỨ HẠNG</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 600, fontSize: '0.85rem' }}>THÍ SINH</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 600, fontSize: '0.85rem', textAlign: 'center' }}>SỐ KÌ THI THAM GIA</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 600, fontSize: '0.85rem', textAlign: 'right' }}>TỔNG ĐIỂM TÍCH LŨY</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 600, fontSize: '0.85rem', textAlign: 'center', width: '100px' }}>CHI TIẾT</th>
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
                          borderBottom: isExpanded ? 'none' : '1px solid #e2e8f0', 
                          transition: 'background-color 0.15s ease',
                          cursor: 'pointer'
                        }}
                        onClick={() => toggleExpandUser(user.displayName)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ padding: '1.25rem 1.5rem', verticalAlign: 'middle' }}>
                          {getRankBadge(rank)}
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{user.displayName}</div>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'center', verticalAlign: 'middle', color: '#475569' }}>
                          <span style={{ backgroundColor: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.85rem' }}>
                            {user.contestCount}
                          </span>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right', verticalAlign: 'middle' }}>
                          <span style={{ color: '#2563eb', fontWeight: 800, fontSize: '1.1rem', fontFamily: 'monospace' }}>
                            {user.totalScore.toLocaleString()}
                          </span>
                        </td>
                        <td style={{ padding: '1.25rem 1.5rem', textAlign: 'center', verticalAlign: 'middle', color: '#94a3b8' }}>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </td>
                      </tr>
                      
                      {isExpanded && (
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <td colSpan={5} style={{ padding: '1rem 2rem' }}>
                            <div style={{ borderLeft: '3px solid #cbd5e1', paddingLeft: '1rem' }}>
                              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#475569', fontWeight: 700 }}>Chi tiết điểm số theo kì thi:</h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {user.details.map((detail, dIdx) => (
                                  <div key={dIdx} className="flex justify-between items-center" style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '450px' }}>
                                    <span>{detail.contestTitle}</span>
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
