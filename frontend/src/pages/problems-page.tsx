import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type Contest, type Task, type TaskStats } from '../lib/api-client';
import { Code2, Search, CheckCircle2, Clock, ArrowRight } from 'lucide-react';

interface RichTask extends Task {
  contestTitle: string;
}

export const ProblemsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  // Query all contests
  const { data: contests = [], isLoading: loadingContests } = useQuery<Contest[]>({
    queryKey: ['contests'],
    queryFn: api.getContests,
  });

  // Query tasks for all contests in parallel
  const { data: tasks = [], isLoading: loadingTasks, error } = useQuery<RichTask[]>({
    queryKey: ['global-tasks', contests.map(c => c.id).join(',')],
    queryFn: async () => {
      if (contests.length === 0) return [];
      const results = await Promise.all(
        contests.map(async (contest) => {
          try {
            const list = await api.getTasks(contest.id);
            return list.map(item => ({
              ...item,
              contestTitle: contest.title,
            }));
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

  const isLoading = loadingContests || (contests.length > 0 && loadingTasks);

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

  // Filter tasks by search term
  const filteredTasks = tasks.filter(t => 
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.contestTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.score_label && t.score_label.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '4rem' }}>
      
      {/* Header Banner */}
      <div className="home-banner" style={{ minHeight: '160px', padding: '2rem 3rem', marginBottom: '2.5rem' }}>
        <div className="home-banner-grid-bg"></div>
        <div className="home-banner-glow"></div>
        
        <div className="home-banner-content">
          <span className="home-banner-badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>Thư Viện Bài Tập</span>
          <h1 className="home-banner-title" style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>Kho Bài Tập Giải Thuật AI</h1>
          <p className="home-banner-subtitle" style={{ fontSize: '1rem', opacity: 0.9 }}>
            Tổng hợp toàn bộ các thử thách lập trình AI, bài tập mô hình hóa dữ liệu từ mọi kì thi trên hệ thống.
          </p>
        </div>
        
        <div style={{ position: 'absolute', right: '5%', bottom: '10%', opacity: 0.15, pointerEvents: 'none' }}>
          <Code2 size={120} color="#ffffff" />
        </div>
      </div>

      {/* Control bar */}
      <div className="panel flex justify-between items-center" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', maxWidth: '380px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Tìm kiếm bài tập, kì thi..."
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
          Hiển thị <strong>{filteredTasks.length}</strong> bài tập
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
          <div className="spinner"></div>
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Đang tải thư viện bài tập...</p>
        </div>
      )}

      {!isLoading && error && (
        <div className="alert alert-danger">
          Không thể tải dữ liệu bài tập từ hệ thống.
        </div>
      )}

      {!isLoading && !error && filteredTasks.length === 0 && (
        <div className="panel flex flex-col items-center justify-center text-center" style={{ padding: '4rem 2rem' }}>
          <Search size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
          <h3 style={{ margin: 0, color: '#475569' }}>Không tìm thấy bài tập</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Không tìm thấy bài tập nào khớp với từ khóa tìm kiếm của bạn.
          </p>
        </div>
      )}

      {!isLoading && !error && filteredTasks.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 600, fontSize: '0.85rem' }}>MÃ/TÊN BÀI TẬP</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 600, fontSize: '0.85rem' }}>KÌ THI</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 600, fontSize: '0.85rem' }}>CHỈ TIÊU ĐÁNH GIÁ</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 600, fontSize: '0.85rem', textAlign: 'center' }}>THỐNG KÊ</th>
                  <th style={{ padding: '1rem 1.5rem', color: '#475569', fontWeight: 600, fontSize: '0.85rem', textAlign: 'right' }}>THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const stats = taskStatsByTaskId.get(task.id);
                  const solvedCount = stats?.solved_entries ?? 0;
                  const successRate = `${Math.round(stats?.success_rate ?? 0)}%`;

                  return (
                    <tr 
                      key={task.id} 
                      style={{ 
                        borderBottom: '1px solid #e2e8f0', 
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{task.title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', marginTop: '0.2rem' }}>ID: {task.id}</div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', color: '#475569', fontSize: '0.9rem' }}>
                        {task.contestTitle}
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <span style={{ fontSize: '0.85rem', backgroundColor: '#f1f5f9', color: '#475569', padding: '0.2rem 0.5rem', borderRadius: '4px', fontFamily: 'monospace' }}>
                          {task.score_label}
                        </span>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', fontSize: '0.85rem', color: '#64748b' }}>
                          <span className="flex items-center gap-1" title="Lượt giải đúng">
                            <CheckCircle2 size={14} style={{ color: '#16a34a' }} />
                            {solvedCount}
                          </span>
                          <span className="flex items-center gap-1" title="Tỷ lệ thành công">
                            <Clock size={14} style={{ color: '#3b82f6' }} />
                            {successRate}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                        <Link 
                          to={`/contests/${task.contest_id}/phases/public_test?tab=problems&taskId=${task.id}`} 
                          className="btn btn-secondary flex items-center gap-1"
                          style={{ 
                            padding: '0.4rem 0.8rem', 
                            fontSize: '0.8rem', 
                            border: '1px solid #cbd5e1', 
                            color: '#0f172a', 
                            borderRadius: '6px',
                            display: 'inline-flex'
                          }}
                        >
                          Chi tiết <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
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
