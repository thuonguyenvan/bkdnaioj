import React, { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type VolunteerWorker } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import { CheckCircle, XCircle, Trash2, Copy, Cpu, HardDrive, Monitor, Activity } from 'lucide-react';

export const AdminWorkersPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [approvedToken, setApprovedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!user || !isAdmin) return <Navigate to="/" replace />;

  const { data: workers = [], isLoading } = useQuery<VolunteerWorker[]>({
    queryKey: ['adminWorkers'],
    queryFn: api.listVolunteerWorkers,
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveVolunteerWorker(id),
    onSuccess: ({ token }) => {
      setApprovedToken(token);
      queryClient.invalidateQueries({ queryKey: ['adminWorkers'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectVolunteerWorker(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminWorkers'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteVolunteerWorker(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminWorkers'] }),
  });

  const handleCopy = () => {
    if (!approvedToken) return;
    navigator.clipboard.writeText(approvedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const counts = {
    active:  workers.filter(w => w.status === 'active').length,
    pending: workers.filter(w => w.status === 'pending').length,
    online:  workers.filter(w => w.online).length,
  };

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Volunteer Judge Workers</h1>
            <p className="page-subtitle">
              Review volunteer workers, monitor online status, and inspect current judging capacity.
            </p>
            <Link to="/admin/scheduler" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'hsl(var(--primary))', fontWeight: 600, marginTop: '0.4rem' }}>
              <Activity size={14} /> Open Scheduler Dashboard →
            </Link>
          </div>
          <div className="flex gap-4" style={{ color: '#64748b', fontSize: '0.85rem', paddingTop: '0.25rem' }}>
            <span>Active: <strong style={{ color: '#334155' }}>{counts.active}</strong></span>
            <span>Pending: <strong style={{ color: '#334155' }}>{counts.pending}</strong></span>
            <span>Online: <strong style={{ color: '#16a34a' }}>{counts.online}</strong></span>
          </div>
        </div>
      </div>

      {/* Token modal */}
      {approvedToken && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>Worker Approved</h2>
            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
              Copy the token below and send it to the volunteer. It will not be shown again.
            </p>
            <div className="flex gap-2" style={{ marginBottom: '1rem' }}>
              <code className="code-token" style={{ flex: 1 }}>{approvedToken}</code>
              <button
                onClick={handleCopy}
                className="btn btn-secondary shrink-0"
                style={{ padding: '0.6rem 0.85rem' }}
              >
                <Copy size={15} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p style={{ color: 'hsl(var(--danger))', fontSize: '0.75rem', margin: '0 0 1rem 0' }}>
              This token will not be displayed again.
            </p>
            <button
              onClick={() => setApprovedToken(null)}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
          <div className="spinner"></div>
          <p className="loading-copy" style={{ marginTop: '1rem' }}>Loading workers...</p>
        </div>
      ) : workers.length === 0 ? (
        <div className="panel text-center empty-copy" style={{ padding: '3rem 1.5rem' }}>
          No volunteer workers registered yet.
        </div>
      ) : (
        <div>
          {workers.map(w => (
            <WorkerRow
              key={w.id}
              worker={w}
              onApprove={() => approveMutation.mutate(w.id)}
              onReject={() => rejectMutation.mutate(w.id)}
              onDelete={() => { if (confirm(`Delete worker "${w.display_name}"?`)) deleteMutation.mutate(w.id); }}
              approving={approveMutation.isPending}
              rejecting={rejectMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const WorkerRow: React.FC<{
  worker: VolunteerWorker;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  approving: boolean;
  rejecting: boolean;
}> = ({ worker, onApprove, onReject, onDelete, approving, rejecting }) => {
  const statusClass: Record<string, string> = {
    pending:  'badge-warning',
    active:   'badge-success',
    rejected: 'badge-danger',
    inactive: 'badge-secondary',
  };

  const lastSeen = worker.last_seen_at
    ? formatRelative(new Date(worker.last_seen_at))
    : 'never';

  return (
    <div className="worker-row">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`worker-status-dot shrink-0 ${worker.online ? 'online' : ''}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="truncate" style={{ fontWeight: 700, color: 'hsl(var(--text-main))' }}>{worker.display_name}</span>
              <span className={`badge ${statusClass[worker.status] ?? 'badge-secondary'}`}>
                {worker.status}
              </span>
              {worker.current_job_id && (
                <span className="badge badge-info">
                  running job
                </span>
              )}
            </div>
            <div className="worker-meta">
              <CapabilityBadges caps={worker.capabilities} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            {worker.jobs_completed}✓ {worker.jobs_failed}✗
          </span>
          <span className="font-mono text-muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            {lastSeen}
          </span>
          {worker.status === 'pending' && (
            <>
              <button
                onClick={onApprove}
                disabled={approving}
                className="btn btn-primary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', backgroundColor: '#16a34a', borderColor: '#16a34a' }}
              >
                <CheckCircle size={13} /> Approve
              </button>
              <button
                onClick={onReject}
                disabled={rejecting}
                className="btn btn-danger"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                <XCircle size={13} /> Reject
              </button>
            </>
          )}
          <button
            onClick={onDelete}
            className="btn btn-secondary"
            style={{ padding: '0.35rem', color: 'hsl(var(--text-muted))' }}
            title="Delete worker"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

const CapabilityBadges: React.FC<{ caps: VolunteerWorker['capabilities'] }> = ({ caps }) => (
  <div className="flex gap-2 flex-wrap">
    {caps.cpu_cores && (
      <span className="flex items-center gap-1">
        <Cpu size={12} />{caps.cpu_cores}C
      </span>
    )}
    {caps.ram_gb && (
      <span className="flex items-center gap-1">
        <Monitor size={12} />{caps.ram_gb}GB
      </span>
    )}
    {caps.gpu?.map((g, i) => (
      <span key={i} className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
        {g.model}
      </span>
    ))}
    {caps.docker_available && (
      <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Docker</span>
    )}
    {caps.disk_free_gb && (
      <span className="flex items-center gap-1">
        <HardDrive size={12} />{caps.disk_free_gb}GB free
      </span>
    )}
  </div>
);

function formatRelative(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
