import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type VolunteerWorker } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import { CheckCircle, XCircle, Trash2, Copy, Cpu, HardDrive, Monitor } from 'lucide-react';

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
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Volunteer Judge Workers</h1>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>Active: <strong className="text-foreground">{counts.active}</strong></span>
          <span>Pending: <strong className="text-foreground">{counts.pending}</strong></span>
          <span>Online: <strong className="text-green-600">{counts.online}</strong></span>
        </div>
      </div>

      {/* Token modal */}
      {approvedToken && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
            <h2 className="text-lg font-semibold mb-2">Worker Approved</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Copy the token below and send it to the volunteer. It will not be shown again.
            </p>
            <div className="flex gap-2 mb-4">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-xs break-all font-mono">
                {approvedToken}
              </code>
              <button
                onClick={handleCopy}
                className="px-3 py-2 border rounded hover:bg-muted flex items-center gap-1 text-sm shrink-0"
              >
                <Copy className="w-4 h-4" />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-destructive mb-4">
              ⚠ This token will not be displayed again.
            </p>
            <button
              onClick={() => setApprovedToken(null)}
              className="w-full py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading workers…</div>
      ) : workers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          No volunteer workers registered yet.
        </div>
      ) : (
        <div className="space-y-3">
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
  const statusColor: Record<string, string> = {
    pending:  'bg-yellow-100 text-yellow-800',
    active:   'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    inactive: 'bg-gray-100 text-gray-600',
  };

  const lastSeen = worker.last_seen_at
    ? formatRelative(new Date(worker.last_seen_at))
    : 'never';

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${worker.online ? 'bg-green-500' : 'bg-gray-300'}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{worker.display_name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[worker.status] ?? ''}`}>
                {worker.status}
              </span>
              {worker.current_job_id && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">
                  running job
                </span>
              )}
            </div>
            <div className="flex gap-4 mt-1 flex-wrap">
              <CapabilityBadges caps={worker.capabilities} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {worker.jobs_completed}✓ {worker.jobs_failed}✗
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {lastSeen}
          </span>
          {worker.status === 'pending' && (
            <>
              <button
                onClick={onApprove}
                disabled={approving}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="w-3 h-3" /> Approve
              </button>
              <button
                onClick={onReject}
                disabled={rejecting}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="w-3 h-3" /> Reject
              </button>
            </>
          )}
          <button
            onClick={onDelete}
            className="p-1 text-muted-foreground hover:text-destructive"
            title="Delete worker"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const CapabilityBadges: React.FC<{ caps: VolunteerWorker['capabilities'] }> = ({ caps }) => (
  <div className="flex gap-1.5 flex-wrap">
    {caps.cpu_cores && (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <Cpu className="w-3 h-3" />{caps.cpu_cores}C
      </span>
    )}
    {caps.ram_gb && (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <Monitor className="w-3 h-3" />{caps.ram_gb}GB
      </span>
    )}
    {caps.gpu?.map((g, i) => (
      <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-medium">
        {g.model}
      </span>
    ))}
    {caps.docker_available && (
      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Docker</span>
    )}
    {caps.disk_free_gb && (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <HardDrive className="w-3 h-3" />{caps.disk_free_gb}GB free
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
