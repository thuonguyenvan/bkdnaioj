import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Announcement, type Contest, type PublicStatsSummary, type Task, type TaskStats } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  AlertCircle,
  MapPin,
  Code2,
  Megaphone,
  Newspaper,
  Trophy,
  Users,
  UploadCloud
} from 'lucide-react';

interface RichAnnouncement extends Announcement {
  contestTitle: string;
}

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

  const contestsForNewsfeed = contests.filter(c => c.status !== 'draft').slice(0, 6);

  const { data: globalTasks = [] } = useQuery<Task[]>({
    queryKey: ['home-global-tasks', contests.map(c => c.id).join(',')],
    queryFn: async () => {
      if (contests.length === 0) return [];
      const results = await Promise.all(
        contests
          .filter(c => c.status !== 'draft')
          .map(async (contest) => {
            try {
              return await api.getTasks(contest.id);
            } catch (e) {
              console.error(`Failed to load tasks for contest ${contest.id}`, e);
              return [];
            }
          })
      );
      return results.flat();
    },
    enabled: contests.length > 0,
  });

  const { data: publicStats } = useQuery<PublicStatsSummary>({
    queryKey: ['public-stats-summary'],
    queryFn: api.getPublicStatsSummary,
    retry: false,
  });

  const { data: taskStats = [] } = useQuery<TaskStats[]>({
    queryKey: ['task-stats'],
    queryFn: api.getTaskStats,
    retry: false,
  });

  const taskStatsByTaskId = useMemo(() => {
    const m = new Map<string, TaskStats>();
    taskStats.forEach((s) => m.set(s.task_id, s));
    return m;
  }, [taskStats]);

  const { data: newsfeedItems = [], isLoading: loadingNewsfeed } = useQuery<RichAnnouncement[]>({
    queryKey: ['home-newsfeed', contestsForNewsfeed.map(c => c.id).join(',')],
    queryFn: async () => {
      if (contestsForNewsfeed.length === 0) return [];

      const results = await Promise.all(
        contestsForNewsfeed.map(async (contest) => {
          try {
            const list = await api.getAnnouncements(contest.id);
            return list.map(item => ({
              ...item,
              contestTitle: contest.title,
            }));
          } catch (e) {
            console.error(`Failed to load announcements for contest ${contest.id}`, e);
            return [];
          }
        })
      );

      return results
        .flat()
        .sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
        .slice(0, 4);
    },
    enabled: contestsForNewsfeed.length > 0,
  });

  const displayContests = contests.filter(c => c.status !== 'draft');

  const contestantCount = publicStats?.users ?? 0;
  const contestCount = publicStats?.contests ?? displayContests.length;
  const problemCount = publicStats?.tasks ?? globalTasks.length;
  const submissionCount = publicStats?.submissions ?? 0;

  const contestsToRender = displayContests;

  const homeTasksSource = realTasks.length > 0 ? realTasks : globalTasks;
  const exercisesToRender = homeTasksSource.slice(0, 5).map((task, index) => {
    const letter = String.fromCharCode(65 + index);

    const stats = taskStatsByTaskId.get(task.id);
    const solvedCount = stats?.solved_entries ?? 0;
    const successRate = `${Math.round(stats?.success_rate ?? 0)}%`;

    return {
      id: task.id,
      letter,
      title: task.title,
      solvedCount,
      successRate,
      link: `/contests/${task.contest_id}`,
    };
  });

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

  const [searchParams] = useSearchParams();

  const handleScrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const scrollTarget = searchParams.get('scroll');
    if (scrollTarget) {
      const timer = setTimeout(() => {
        handleScrollToSection(`${scrollTarget}-section`);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>

      {/* Top: Hero + Newsfeed */}
      <div className="home-top-grid">
        <div className="home-banner" style={{ marginBottom: 0 }}>
          <div className="home-banner-grid-bg"></div>
          <div className="home-banner-glow"></div>

          <div className="home-banner-content">
            <span className="home-banner-badge">AI OLP 2026</span>
            <h1 className="home-banner-title">Nền tảng thi lập trình dành cho sinh viên</h1>
            <p className="home-banner-subtitle">
              Công bằng. Minh bạch. Hiệu quả. Dành riêng cho các cuộc thi AI OLP tại các trường đại học.
            </p>
            <div className="home-banner-actions">
              <button
                onClick={() => handleScrollToSection('contests-section')}
                className="btn btn-primary"
                style={{ backgroundColor: '#2563eb', padding: '0.75rem 1.5rem', fontWeight: 600, border: 'none', borderRadius: '6px' }}
              >
                Xem cuộc thi
              </button>
              <button
                onClick={() => handleScrollToSection('exercises-section')}
                className="btn btn-secondary"
                style={{ border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)', color: '#ffffff', padding: '0.75rem 1.5rem', fontWeight: 600, borderRadius: '6px' }}
              >
                Giải bài tập
              </button>
            </div>
          </div>

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

        <div className="panel" style={{ marginBottom: 0, padding: '1.25rem 1.25rem' }}>
          <div className="home-section-header" style={{ marginBottom: '1rem', paddingBottom: '0.75rem' }}>
            <h3 className="home-section-title" style={{ fontSize: '1.05rem' }}>
              <Megaphone size={18} style={{ color: '#2563eb' }} />
              Newsfeed
            </h3>
            <Link to="/newsfeed" className="home-section-link">Xem tất cả</Link>
          </div>

          {loadingNewsfeed && (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: '160px' }}>
              <div className="spinner"></div>
            </div>
          )}

          {!loadingNewsfeed && newsfeedItems.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '0.5rem 0' }}>
              Chưa có thông báo nào.
            </div>
          )}

          {!loadingNewsfeed && newsfeedItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {newsfeedItems.map((item) => {
                const d = new Date(item.created_at);
                const pad = (n: number) => n.toString().padStart(2, '0');
                const dateLabel = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

                return (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: '0.9rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', paddingTop: '0.1rem' }}>
                      {dateLabel}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 700, marginBottom: '0.15rem' }}>
                        {item.contestTitle}
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 650, color: 'var(--text-main)', lineHeight: 1.35 }}>
                        {item.title}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Below: 3 columns */}
      <div className="home-section-grid">

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
              <Link to="/contests" className="home-section-link">Xem tất cả</Link>
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
              {contestsToRender.length === 0 ? (
                <div className="panel" style={{ padding: '2rem', textAlign: 'center' }}>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 650, marginBottom: '0.5rem' }}>Chưa có cuộc thi nào</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Hãy chạy seed để tạo dữ liệu demo.</div>
                </div>
              ) : contestsToRender.map((contest: any) => {
                const isUpcoming = new Date(contest.start_time) > new Date();
                const isEnded = new Date(contest.end_time) < new Date();

                const formatText = contest.entry_policy === 'team'
                  ? 'Thi đồng đội'
                  : contest.entry_policy === 'individual'
                    ? 'Thi cá nhân'
                    : 'Cả hai';

                const locationText = 'Online';

                return (
                  <div key={contest.id} className="contest-row-card">
                    <div className="contest-row-thumb">AI OLP</div>

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
                            backgroundColor: formatText === 'Thi đồng đội' ? '#eff6ff' : '#f0fdf4',
                            color: formatText === 'Thi đồng đội' ? '#2563eb' : '#16a34a',
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
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div id="exercises-section">
          <div className="home-section-header">
            <h3 className="home-section-title">
              <Code2 size={18} style={{ color: '#2563eb' }} />
              Bài tập mới
            </h3>
            <Link to="/problems" className="home-section-link">Xem tất cả</Link>
          </div>

          <div className="exercise-list">
            {exercisesToRender.length === 0 ? (
              <div style={{ padding: '1.25rem', color: 'var(--text-muted)' }}>Chưa có bài tập.</div>
            ) : exercisesToRender.map((exercise) => {
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

        <div>
          <div className="home-section-header">
            <h3 className="home-section-title">
              <Trophy size={18} style={{ color: '#2563eb' }} />
              Thống kê
            </h3>
          </div>

          <div className="panel" style={{ marginBottom: 0, padding: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                    <Users size={18} />
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 650 }}>Thí sinh</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{contestantCount.toLocaleString('en-US')}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                    <Trophy size={18} />
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 650 }}>Cuộc thi</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{contestCount.toLocaleString('en-US')}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
                    <Code2 size={18} />
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 650 }}>Bài tập</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{problemCount.toLocaleString('en-US')}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c' }}>
                    <UploadCloud size={18} />
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontWeight: 650 }}>Lượt nộp</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{submissionCount.toLocaleString('en-US')}</div>
              </div>

              <Link
                to="/newsfeed"
                className="home-section-link"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}
              >
                <Newspaper size={16} /> Xem Newsfeed
              </Link>
            </div>
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
                  <option value="individual">Chỉ cá nhân</option>
                  <option value="team">Chỉ đội nhóm</option>
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
