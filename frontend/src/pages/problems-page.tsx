import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type Contest, type Task, type TaskStats } from '../lib/api-client';
import { Search, CheckCircle2, Clock, ArrowRight } from 'lucide-react';

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

  const publicContests = useMemo(
    () => contests.filter(contest => contest.visibility === 'public'),
    [contests]
  );

  // Query tasks for all contests in parallel
  const { data: tasks = [], isLoading: loadingTasks, error } = useQuery<RichTask[]>({
    queryKey: ['global-tasks', publicContests.map(c => c.id).join(',')],
    queryFn: async () => {
      if (publicContests.length === 0) return [];
      const results = await Promise.all(
        publicContests.map(async (contest) => {
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
    enabled: !loadingContests,
  });

  const isLoading = loadingContests || loadingTasks;

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
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      <div className="page-header">
        <h1 className="page-title">AI Algorithm Problem Archive</h1>
        <p className="page-subtitle">
          Browse AI programming challenges and data modeling tasks from all contests on the platform.
        </p>
      </div>

      <div className="panel toolbar-panel">
        <div className="search-field">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search problems or contests..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="toolbar-meta">
          Showing <strong>{filteredTasks.length}</strong> problems
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
          <div className="spinner"></div>
          <p style={{ marginTop: '1rem', color: 'hsl(var(--text-muted))' }}>Loading problem library...</p>
        </div>
      )}

      {!isLoading && error && (
        <div className="alert alert-danger">
          Could not load problem data from the system.
        </div>
      )}

      {!isLoading && !error && filteredTasks.length === 0 && (
        <div className="panel empty-state">
          <Search size={48} />
          <h3>No problems found</h3>
          <p>No problems match your current search.</p>
        </div>
      )}

      {!isLoading && !error && filteredTasks.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="oj-table">
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Contest</th>
                  <th style={{ width: '150px' }}>Metric</th>
                  <th style={{ width: '180px', textAlign: 'center' }}>Stats</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const stats = taskStatsByTaskId.get(task.id);
                  const solvedCount = stats?.solved_entries ?? 0;
                  const successRate = `${Math.round(stats?.success_rate ?? 0)}%`;

                  return (
                    <tr key={task.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{task.title}</div>
                      </td>
                      <td style={{ color: '#475569' }}>
                        {task.contestTitle}
                      </td>
                      <td>
                        <span className="metric-pill">{task.score_label}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', fontSize: '0.85rem', color: '#64748b' }}>
                          <span className="flex items-center gap-1" title="Solved entries">
                            <CheckCircle2 size={14} style={{ color: '#16a34a' }} />
                            {solvedCount}
                          </span>
                          <span className="flex items-center gap-1" title="Success rate">
                            <Clock size={14} style={{ color: 'hsl(var(--primary))' }} />
                            {successRate}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link 
                          to={`/contests/${task.contest_id}/phases/public_test?tab=problems&taskId=${task.id}`} 
                          className="btn btn-secondary btn-sm"
                        >
                          Details <ArrowRight size={12} />
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
