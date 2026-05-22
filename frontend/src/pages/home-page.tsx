import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Contest, type Task } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  AlertCircle,
  Cpu,
  BarChart3,
  Award,
  Users,
  MapPin,
  Code2
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [entryPolicy, setEntryPolicy] = useState<'individual' | 'team' | 'both'>('individual');
  const [formError, setFormError] = useState<string | null>(null);

  // Query contests
  const { data: contests = [], isLoading, error } = useQuery<Contest[]>({
    queryKey: ['contests'],
    queryFn: api.getContests,
  });

  // Create contest mutation
  const createContestMutation = useMutation({
    mutationFn: api.createContest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      setShowCreateModal(false);
      // Reset form
      setTitle('');
      setSlug('');
      setDescription('');
      setStartTime('');
      setEndTime('');
      setEntryPolicy('individual');
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message || 'Failed to create contest.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title || !slug || !startTime || !endTime) {
      setFormError('Please fill in all required fields.');
      return;
    }
    createContestMutation.mutate({
      title,
      slug,
      description,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      entry_policy: entryPolicy,
      visibility: 'public',
      max_team_size: entryPolicy === 'team' || entryPolicy === 'both' ? 3 : 1,
      require_approval: false,
    });
  };

  // Group contests
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

  // Fetch tasks of the first active or upcoming contest for "Bài tập mới"
  const activeContest = activeContests[0] || upcomingContests[0] || contests[0];
  const { data: realTasks = [] } = useQuery<Task[]>({
    queryKey: ['contest-tasks', activeContest?.id],
    queryFn: () => api.getTasks(activeContest.id),
    enabled: !!activeContest?.id,
  });

  // Fallback / Mock Contests for demo when DB is empty
  const displayContests = contests.filter(c => c.status !== 'draft');
  const contestsToRender = displayContests.length > 0 ? displayContests : [
    {
      id: 'mock-1',
      title: 'AI OLP 2024 - Vòng loại',
      slug: 'ai-olp-2024-vong-loai',
      start_time: '2026-06-01T08:00:00Z',
      end_time: '2026-06-01T13:00:00Z',
      entry_policy: 'individual' as const,
      status: 'running' as const,
      isMock: true,
      mode: 'ICPC style',
      location: 'Online'
    },
    {
      id: 'mock-2',
      title: 'AI OLP 2024 - Chung kết',
      slug: 'ai-olp-2024-chung-ket',
      start_time: '2026-06-15T08:00:00Z',
      end_time: '2026-06-15T13:00:00Z',
      entry_policy: 'team' as const,
      status: 'upcoming' as const,
      isMock: true,
      mode: 'IOI style',
      location: 'Onsite'
    }
  ];

  // Exercises data generation
  const mockExercises = [
    {
      id: 'mock-ex-1',
      letter: 'A',
      title: 'AI Foundation',
      difficulty: 'Easy',
      solvedCount: 100,
      successRate: '60%',
      link: '#'
    },
    {
      id: 'mock-ex-2',
      letter: 'B',
      title: 'Data Processing',
      difficulty: 'Medium',
      solvedCount: 78,
      successRate: '42%',
      link: '#'
    },
    {
      id: 'mock-ex-3',
      letter: 'C',
      title: 'Neural Network',
      difficulty: 'Medium',
      solvedCount: 64,
      successRate: '35%',
      link: '#'
    },
    {
      id: 'mock-ex-4',
      letter: 'D',
      title: 'Decision Tree',
      difficulty: 'Hard',
      solvedCount: 45,
      successRate: '20%',
      link: '#'
    },
    {
      id: 'mock-ex-5',
      letter: 'E',
      title: 'Heuristic Search',
      difficulty: 'Hard',
      solvedCount: 31,
      successRate: '15%',
      link: '#'
    }
  ];

  const exercisesToRender: Array<{
    id: string;
    letter: string;
    title: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    solvedCount: number;
    successRate: string;
    link: string;
  }> = [];

  // Map real tasks if they exist
  realTasks.forEach((task, index) => {
    const letter = String.fromCharCode(65 + index); // A, B, C...
    let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium';
    if (index === 0) difficulty = 'Easy';
    if (index > 3) difficulty = 'Hard';

    const solvedCount = Math.max(12, 120 - index * 18);
    const successRate = `${Math.max(10, 70 - index * 12)}%`;

    exercisesToRender.push({
      id: task.id,
      letter,
      title: task.title,
      difficulty,
      solvedCount,
      successRate,
      link: `/contests/${activeContest.id}`
    });
  });

  // Pad with mock exercises
  if (exercisesToRender.length < 5) {
    const existingCount = exercisesToRender.length;
    const padding = mockExercises.slice(existingCount);
    padding.forEach((item) => {
      const letter = String.fromCharCode(65 + exercisesToRender.length);
      exercisesToRender.push({
        id: item.id,
        letter,
        title: item.title,
        difficulty: item.difficulty as 'Easy' | 'Medium' | 'Hard',
        solvedCount: item.solvedCount,
        successRate: item.successRate,
        link: item.link
      });
    });
  }

  // Date formatter helper: DD/MM/YYYY HH:mm
  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const handleScrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', maxWidth: '1280px' }}>
      
      {/* Hero Banner Section */}
      <div className="home-banner">
        <div className="home-banner-grid-bg"></div>
        <div className="home-banner-glow"></div>
        
        <div className="home-banner-content">
          <span className="home-banner-badge">AI OLP 2026</span>
          <h1 className="home-banner-title">AI OLP Student Contest</h1>
          <p className="home-banner-subtitle">
            Nền tảng thi lập trình trực tuyến dành cho sinh viên – Công bằng. Minh bạch. Hiệu quả.
          </p>
          <div className="home-banner-actions">
            <button 
              onClick={() => handleScrollToSection('contests-section')}
              className="btn btn-primary"
              style={{ backgroundColor: '#2563eb', padding: '0.75rem 1.5rem', fontWeight: 600, border: 'none', borderRadius: '6px' }}
            >
              Xem contest hiện tại
            </button>
            <button 
              onClick={() => handleScrollToSection('exercises-section')}
              className="btn btn-secondary"
              style={{ border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)', color: '#ffffff', padding: '0.75rem 1.5rem', fontWeight: 600, borderRadius: '6px' }}
            >
              Xem bài tập
            </button>
          </div>
        </div>

        {/* Code Editor Widget mockup on the right */}
        <div className="code-mockup-card">
          <div className="code-mockup-header">
            <span className="code-mockup-dot" style={{ backgroundColor: '#ef4444' }}></span>
            <span className="code-mockup-dot" style={{ backgroundColor: '#eab308' }}></span>
            <span className="code-mockup-dot" style={{ backgroundColor: '#22c55e' }}></span>
            <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)' }}>solution.cpp</span>
          </div>
          <div className="code-mockup-body" style={{ fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.6' }}>
            <div>
              <span style={{ color: '#f43f5e' }}>#include</span>{' '}
              <span style={{ color: '#34d399' }}>&lt;bits/stdc++.h&gt;</span>
            </div>
            <div>
              <span style={{ color: '#f43f5e' }}>using namespace</span>{' '}
              <span style={{ color: '#e2e8f0' }}>std;</span>
            </div>
            <br />
            <div>
              <span style={{ color: '#3b82f6' }}>int</span>{' '}
              <span style={{ color: '#fbbf24' }}>main</span>() {'{'}
            </div>
            <div style={{ paddingLeft: '1.25rem' }}>
              <span style={{ color: '#60a5fa' }}>ios::sync_with_stdio</span>(
              <span style={{ color: '#f43f5e' }}>false</span>);
            </div>
            <div style={{ paddingLeft: '1.25rem' }}>
              <span style={{ color: '#60a5fa' }}>cin.tie</span>(
              <span style={{ color: '#fbbf24' }}>nullptr</span>);
            </div>
            <br />
            <div style={{ paddingLeft: '1.25rem' }}>
              <span style={{ color: '#f43f5e' }}>return</span>{' '}
              <span style={{ color: '#60a5fa' }}>0</span>;
            </div>
            <div>{'}'}</div>
          </div>
        </div>
      </div>

      {/* Feature showcase grid */}
      <div className="feature-grid">
        <div className="feature-card">
          <div className="feature-icon-container" style={{ backgroundColor: '#e0e7ff', color: '#4f46e5' }}>
            <Cpu size={22} />
          </div>
          <div>
            <div className="feature-title">Hệ thống chấm tự động</div>
            <div className="feature-desc">Chấm bài nhanh chóng, chính xác và bảo mật.</div>
          </div>
        </div>
        
        <div className="feature-card">
          <div className="feature-icon-container" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>
            <BarChart3 size={22} />
          </div>
          <div>
            <div className="feature-title">Bảng xếp hạng</div>
            <div className="feature-desc">Cập nhật realtime, minh bạch cho từng cuộc thi.</div>
          </div>
        </div>
        
        <div className="feature-card">
          <div className="feature-icon-container" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>
            <Award size={22} />
          </div>
          <div>
            <div className="feature-title">Nhiều cuộc thi</div>
            <div className="feature-desc">Đa dạng format: ICPC-style, IOI-style, và nhiều hơn nữa.</div>
          </div>
        </div>
        
        <div className="feature-card">
          <div className="feature-icon-container" style={{ backgroundColor: '#e0f2fe', color: '#0284c7' }}>
            <Users size={22} />
          </div>
          <div>
            <div className="feature-title">Cộng đồng lập trình</div>
            <div className="feature-desc">Thảo luận, học hỏi và chia sẻ kinh nghiệm.</div>
          </div>
        </div>
      </div>

      {/* Two Column details section */}
      <div className="home-section-grid">
        
        {/* Left Column: Contests list */}
        <div id="contests-section">
          <div className="home-section-header">
            <h3 className="home-section-title">
              <Calendar size={18} style={{ color: '#2563eb' }} />
              Cuộc thi sắp diễn ra
            </h3>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <button 
                  onClick={() => setShowCreateModal(true)} 
                  className="btn btn-primary flex items-center gap-1.5"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', backgroundColor: '#2563eb', borderRadius: '6px' }}
                >
                  <Plus size={14} /> Tạo cuộc thi
                </button>
              )}
              <Link to="/" className="home-section-link">Xem tất cả</Link>
            </div>
          </div>

          {isLoading && (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: '150px' }}>
              <div className="spinner"></div>
            </div>
          )}

          {error && (
            <div className="alert alert-danger" style={{ fontSize: '0.85rem' }}>
              Không thể tải danh sách cuộc thi. Vui lòng kiểm tra kết nối với máy chủ.
            </div>
          )}

          {!isLoading && (
            <div>
              {contestsToRender.map((contest: any) => {
                const isUpcoming = new Date(contest.start_time) > new Date();
                const isEnded = new Date(contest.end_time) < new Date();
                
                let formatText = contest.entry_policy === 'team' ? 'ICPC style' : 'IOI style';
                if (contest.isMock) {
                  formatText = contest.mode;
                }
                
                const locationText = contest.isMock ? contest.location : 'Online';
                const statusBadgeStyle = isUpcoming 
                  ? { backgroundColor: '#f1f5f9', color: '#475569' } 
                  : isEnded 
                  ? { backgroundColor: '#fee2e2', color: '#dc2626' } 
                  : { backgroundColor: '#dcfce7', color: '#16a34a' };

                const statusText = isUpcoming ? 'Sắp diễn ra' : isEnded ? 'Đã kết thúc' : 'Đang diễn ra';

                return (
                  <div key={contest.id} className="contest-row-card">
                    <div className="contest-row-thumb">
                      AI OLP
                    </div>
                    
                    <div className="contest-row-details">
                      <div className="contest-row-title-container">
                        <h4 className="contest-row-title">{contest.title}</h4>
                        <span 
                          className="badge" 
                          style={{
                            fontSize: '0.7rem',
                            padding: '0.15rem 0.45rem',
                            fontWeight: 600,
                            borderRadius: '4px',
                            backgroundColor: formatText.includes('ICPC') ? '#eff6ff' : '#f0fdf4',
                            color: formatText.includes('ICPC') ? '#2563eb' : '#16a34a',
                            border: 'none'
                          }}
                        >
                          {formatText}
                        </span>
                      </div>
                      
                      <div className="contest-row-meta">
                        <span className="contest-row-meta-item">
                          <Clock size={13} style={{ color: '#94a3b8' }} />
                          {formatDateTime(contest.start_time)} - {formatDateTime(contest.end_time)}
                        </span>
                        <span className="contest-row-meta-item">
                          <MapPin size={13} style={{ color: '#94a3b8' }} />
                          {locationText}
                        </span>
                      </div>
                    </div>

                    <div className="contest-row-action">
                      {contest.isMock ? (
                        <button 
                          disabled
                          className="btn" 
                          style={{
                            ...statusBadgeStyle,
                            padding: '0.45rem 0.9rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            cursor: 'default',
                            border: 'none'
                          }}
                        >
                          {statusText}
                        </button>
                      ) : (
                        <Link 
                          to={`/contests/${contest.id}`} 
                          className="btn"
                          style={{
                            backgroundColor: isEnded || isUpcoming ? '#f1f5f9' : '#2563eb',
                            color: isEnded || isUpcoming ? '#475569' : '#ffffff',
                            padding: '0.45rem 0.9rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: 'none',
                            textDecoration: 'none',
                            display: 'inline-block'
                          }}
                        >
                          {isUpcoming ? 'Chi tiết' : isEnded ? 'Bảng điểm' : 'Vào thi'}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Exercises list */}
        <div id="exercises-section">
          <div className="home-section-header">
            <h3 className="home-section-title">
              <Code2 size={18} style={{ color: '#2563eb' }} />
              Bài tập mới
            </h3>
            <Link to="/" className="home-section-link">Xem tất cả</Link>
          </div>

          <div className="exercise-list">
            {exercisesToRender.map((exercise) => {
              const diffColor = exercise.difficulty === 'Easy' 
                ? { bg: '#f0fdf4', text: '#16a34a' } 
                : exercise.difficulty === 'Medium' 
                ? { bg: '#fffbeb', text: '#d97706' } 
                : { bg: '#fef2f2', text: '#dc2626' };

              return (
                <div key={exercise.id} className="exercise-row">
                  <div className="exercise-name-col">
                    <span className="exercise-letter">{exercise.letter}.</span>
                    {exercise.link === '#' ? (
                      <span className="exercise-title-link" style={{ cursor: 'pointer' }}>{exercise.title}</span>
                    ) : (
                      <Link to={exercise.link} className="exercise-title-link">{exercise.title}</Link>
                    )}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <span 
                      style={{
                        backgroundColor: diffColor.bg,
                        color: diffColor.text,
                        borderRadius: '4px',
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.725rem',
                        fontWeight: 600,
                        display: 'inline-block'
                      }}
                    >
                      {exercise.difficulty}
                    </span>
                  </div>

                  <div className="exercise-stats-col">
                    <span className="flex items-center gap-1" style={{ marginRight: '1rem' }} title="Lượt giải đúng">
                      <CheckCircle2 size={13} style={{ color: '#94a3b8' }} />
                      {exercise.solvedCount}
                    </span>
                    <span className="flex items-center gap-1" title="Tỷ lệ thành công">
                      <Clock size={13} style={{ color: '#94a3b8' }} />
                      {exercise.successRate}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Creation Modal (Visible to Admin only) */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="panel" style={{ width: '100%', maxWidth: '500px', backgroundColor: 'var(--panel)', marginBottom: 0, borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Tạo cuộc thi mới</h3>
            {formError && (
              <div className="alert alert-danger flex items-center gap-2">
                <AlertCircle size={18} />
                <div>{formError}</div>
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Tên cuộc thi *</label>
                <input
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                  }}
                  required
                  placeholder="Ví dụ: AI Driving Agent Challenge"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Đường dẫn thân thiện (Slug) *</label>
                <input
                  type="text"
                  className="form-input"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  placeholder="Ví dụ: ai-driving-challenge"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Mô tả ngắn</label>
                <textarea
                  className="form-input"
                  style={{ height: '80px', resize: 'vertical' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mục tiêu cuộc thi, thể lệ, quy tắc..."
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Thời gian bắt đầu *</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Thời gian kết thúc *</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Chế độ tham gia</label>
                <select
                  className="form-input"
                  value={entryPolicy}
                  onChange={(e: any) => setEntryPolicy(e.target.value)}
                >
                  <option value="individual">Chỉ cá nhân (IOI style)</option>
                  <option value="team">Chỉ đội nhóm (ICPC style)</option>
                  <option value="both">Cả hai chế độ</option>
                </select>
              </div>

              <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary" style={{ borderRadius: '6px' }}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#2563eb', borderRadius: '6px' }} disabled={createContestMutation.isPending}>
                  {createContestMutation.isPending ? 'Đang tạo...' : 'Tạo cuộc thi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
