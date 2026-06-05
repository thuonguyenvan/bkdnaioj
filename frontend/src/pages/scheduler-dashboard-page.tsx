import React, { useEffect, useState, useRef } from 'react';
import { API_BASE_URL } from '../lib/api-client';
import { Activity, Cpu, MemoryStick, Layers, CheckCircle2, XCircle, Clock, Wifi, WifiOff, Loader2 } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkerCapabilities {
  cpu_cores?: number;
  ram_mb?: number;
  has_gpu?: boolean;
  gpu_vram_mb?: number;
  ops_per_sec?: number;
}

interface WorkerItem {
  id: string;
  display_name: string;
  status_label: 'online_idle' | 'online_busy' | 'offline';
  online: boolean;
  active_jobs: number;
  max_workers: number;
  capabilities: WorkerCapabilities;
  cpu_usage: number | null;
  ram_usage: number | null;
  jobs_completed: number;
  jobs_failed: number;
  last_seen_at: string | null;
}

interface LogItem {
  submission_id: string;
  worker_id: string;
  worker_name: string;
  phase_key: string;
  is_final: boolean;
  predicted_seconds: number | null;
  actual_seconds: number | null;
  error_ratio: number | null;
  created_at: string;
}

interface Snapshot {
  workers: WorkerItem[];
  queue_depth: number;
  recent_logs: LogItem[];
  timestamp: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSecs(s: number | null | undefined): string {
  if (s == null) return '—';
  return s >= 60 ? `${(s / 60).toFixed(1)}m` : `${s.toFixed(1)}s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function errRatioColor(r: number | null): string {
  if (r == null) return '#94a3b8';
  if (r < 1.2) return '#22c55e';
  if (r < 1.6) return '#f59e0b';
  return '#ef4444';
}

function StatusBadge({ label }: { label: WorkerItem['status_label'] }) {
  const cfg = {
    online_idle: { dot: '#22c55e', text: 'Idle', bg: '#f0fdf4', border: '#bbf7d0' },
    online_busy: { dot: '#f59e0b', text: 'Busy', bg: '#fffbeb', border: '#fde68a' },
    offline:     { dot: '#94a3b8', text: 'Offline', bg: '#f8fafc', border: '#e2e8f0' },
  }[label];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: '#334155',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {cfg.text}
    </span>
  );
}

function UsageBar({ value, color }: { value: number | null; color: string }) {
  const pct = value ?? 0;
  return (
    <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  );
}

function CapacityBar({ active, max }: { active: number; max: number }) {
  const pct = max > 0 ? (active / max) * 100 : 0;
  const color = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#3b82f6';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8, flex: 1, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
        {active}/{max}
      </span>
    </div>
  );
}

// ── Worker Card ───────────────────────────────────────────────────────────────

function WorkerCard({ w }: { w: WorkerItem }) {
  const cap = w.capabilities ?? {};
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
      padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem',
      opacity: w.online ? 1 : 0.6, transition: 'opacity 0.3s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{w.display_name}</div>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>
            {w.id.slice(0, 8)}…
          </div>
        </div>
        <StatusBadge label={w.status_label} />
      </div>

      {/* Capacity */}
      <div>
        <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.25rem', fontWeight: 500 }}>
          Concurrent jobs
        </div>
        <CapacityBar active={w.active_jobs} max={w.max_workers} />
      </div>

      {/* CPU / RAM */}
      {w.online && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Cpu size={11} style={{ color: '#64748b', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', color: '#64748b', width: 28 }}>{w.cpu_usage ?? '—'}%</span>
            <UsageBar value={w.cpu_usage} color="#3b82f6" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MemoryStick size={11} style={{ color: '#64748b', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', color: '#64748b', width: 28 }}>{w.ram_usage ?? '—'}%</span>
            <UsageBar value={w.ram_usage} color="#8b5cf6" />
          </div>
        </div>
      )}

      {/* Hardware */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        {cap.cpu_cores && (
          <span style={chipStyle}><Cpu size={10} /> {cap.cpu_cores} cores</span>
        )}
        {cap.ram_mb && (
          <span style={chipStyle}><MemoryStick size={10} /> {Math.round(cap.ram_mb / 1024)}GB RAM</span>
        )}
        {cap.has_gpu && (
          <span style={{ ...chipStyle, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
            GPU {cap.gpu_vram_mb ? `${Math.round(cap.gpu_vram_mb / 1024)}GB` : ''}
          </span>
        )}
      </div>

      {/* Footer stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.4rem', borderTop: '1px solid #f1f5f9' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', color: '#22c55e' }}>
          <CheckCircle2 size={11} /> {w.jobs_completed}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', color: '#ef4444' }}>
          <XCircle size={11} /> {w.jobs_failed}
        </span>
        {w.last_seen_at && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: '#94a3b8' }}>
            <Clock size={10} /> {fmtTime(w.last_seen_at)}
          </span>
        )}
      </div>
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
  padding: '0.15rem 0.45rem', borderRadius: 4, fontSize: '0.68rem', fontWeight: 500,
  background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0',
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export const SchedulerDashboardPage: React.FC = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('olpai_token');
    if (!token) { setError('Not authenticated'); return; }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setConnected(false);

    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/admin/workers/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
        if (!res.ok) { setError(`HTTP ${res.status}`); return; }
        if (!res.body) { setError('Streaming not supported'); return; }

        setConnected(true);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            const line = part.trim();
            if (line.startsWith('data: ')) {
              try {
                setSnapshot(JSON.parse(line.slice(6)));
              } catch {}
            }
          }
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') setError('Connection lost');
      } finally {
        setConnected(false);
      }
    })();

    return () => ctrl.abort();
  }, []);

  // Derived stats
  const workers = snapshot?.workers ?? [];
  const onlineCount = workers.filter(w => w.online).length;
  const busyCount   = workers.filter(w => w.status_label === 'online_busy').length;
  const totalActive = workers.reduce((s, w) => s + w.active_jobs, 0);

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={20} style={{ color: 'hsl(var(--primary))' }} />
            Scheduler Dashboard
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0.2rem 0 0' }}>
            Real-time visualization of Capability-Aware Scheduling
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: connected ? '#22c55e' : '#94a3b8', fontWeight: 600 }}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? 'Live' : 'Connecting…'}
          {connected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      {!snapshot && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', padding: '2rem 0' }}>
          <Loader2 size={18} className="spinner" /> Waiting for first snapshot…
        </div>
      )}

      {snapshot && (
        <>
          {/* Stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Total workers',  value: workers.length, icon: <Layers size={16} />, color: '#3b82f6' },
              { label: 'Online',          value: onlineCount,    icon: <Wifi size={16} />,   color: '#22c55e' },
              { label: 'Busy',            value: busyCount,      icon: <Activity size={16} />, color: '#f59e0b' },
              { label: 'Queue depth',     value: snapshot.queue_depth, icon: <Layers size={16} />, color: snapshot.queue_depth > 0 ? '#ef4444' : '#94a3b8' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ color: s.color }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Worker grid */}
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Cpu size={16} style={{ color: 'hsl(var(--primary))' }} /> Workers
            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>— {totalActive} active job{totalActive !== 1 ? 's' : ''} across {onlineCount} online</span>
          </h2>

          {workers.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No registered workers.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem', marginBottom: '2rem' }}>
              {workers.map(w => <WorkerCard key={w.id} w={w} />)}
            </div>
          )}

          {/* Recent scheduling log */}
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={16} style={{ color: 'hsl(var(--primary))' }} /> Recent Scheduling Log
            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>— last 20 jobs</span>
          </h2>

          {snapshot.recent_logs.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No job execution history yet.</p>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Time', 'Worker', 'Phase', 'Type', 'Predicted', 'Actual', 'Error ratio'].map(h => (
                      <th key={h} style={{ padding: '0.55rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.recent_logs.map((l, i) => {
                    const ratio = l.error_ratio;
                    return (
                      <tr key={`${l.submission_id}-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtTime(l.created_at)}</td>
                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#0f172a' }}>{l.worker_name || '—'}</td>
                        <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', color: '#334155', fontSize: '0.75rem' }}>{l.phase_key}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <span style={{
                            padding: '0.15rem 0.45rem', borderRadius: 4, fontSize: '0.68rem', fontWeight: 600,
                            background: l.is_final ? '#fef3c7' : '#eff6ff',
                            color: l.is_final ? '#92400e' : '#1e40af',
                          }}>
                            {l.is_final ? 'Final' : 'Output'}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>{fmtSecs(l.predicted_seconds)}</td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>{fmtSecs(l.actual_seconds)}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          {ratio != null ? (
                            <span style={{ fontWeight: 700, color: errRatioColor(ratio) }}>
                              {ratio.toFixed(2)}×
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ fontSize: '0.72rem', color: '#cbd5e1', textAlign: 'right', marginTop: '0.5rem' }}>
            Last updated: {fmtTime(snapshot.timestamp)}
          </p>
        </>
      )}
    </div>
  );
};
