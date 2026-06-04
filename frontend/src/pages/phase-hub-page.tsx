import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api, API_BASE_URL, type Contest, type PhaseDef, type Task, type Phase, type ContestEntry, type Submission, type LeaderboardRow, type Team } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import {
  FileText, UploadCloud, Play, RefreshCw, ArrowLeft, Star, ShieldAlert, Lock, Unlock
} from 'lucide-react';

const formatParticipantName = (row: { display_name: string; entry_type: string; user_emails?: string[] }) => {
  if (row.entry_type === 'individual') {
    if (row.user_emails && row.user_emails.length > 0) {
      const email = row.user_emails[0];
      return email.split('@')[0];
    }
    return row.display_name.includes('@') ? row.display_name.split('@')[0] : row.display_name;
  } else if (row.entry_type === 'team') {
    if (row.user_emails && row.user_emails.length > 0) {
      const members = row.user_emails.map(email => email.split('@')[0]).join(', ');
      return `${row.display_name} (${members})`;
    }
    return row.display_name;
  }
  return row.display_name;
};

const artifactContentType = (file: File) => file.type || 'application/octet-stream';

const contractForPhase = (task: Task | undefined, isFinal: boolean) => {
  const schema = task?.submission_schema || {};
  return isFinal ? schema.final : schema.non_final;
};

type StandingsEntryMode = 'both' | 'official' | 'virtual' | 'practice';

const PHASE_LABELS: Record<PhaseDef['key'], string> = {
  public_test: 'Public Test',
  final_public: 'Final Public',
  private_test: 'Private Test',
  final_private: 'Final Private',
};

const getPhaseLabel = (def?: PhaseDef, fallback?: string) => {
  if (def) return PHASE_LABELS[def.key] || def.key.replace(/_/g, ' ');
  return fallback?.replace(/_/g, ' ') || 'Phase';
};

export const PhaseHubPage: React.FC = () => {
  const { contestId, phaseKey } = useParams<{ contestId: string, phaseKey: string }>();
  const { user, isAdmin, isJury } = useAuth();
  const queryClient = useQueryClient();

  const getPdfUrl = (url: string | null | undefined) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const apiBase = API_BASE_URL.endsWith('/api/v1') ? API_BASE_URL.slice(0, -7) : API_BASE_URL;
    return `${apiBase}${url}`;
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState<'overview' | 'problems' | 'submissions' | 'standings'>(() => {
    const validTabs = ['overview', 'problems', 'submissions', 'standings'];
    return (tabParam && validTabs.includes(tabParam)) ? (tabParam as any) : 'problems';
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Sync activeTab state with URL parameter if it changes
  useEffect(() => {
    const validTabs = ['overview', 'problems', 'submissions', 'standings'];
    if (tabParam && validTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam as any);
    }
  }, [tabParam]);

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    const nextParams: Record<string, string> = { tab };
    const taskIdParam = searchParams.get('taskId');
    if (tab === 'problems' && selectedTaskId) {
      nextParams.taskId = selectedTaskId;
    } else if (tab === 'problems' && taskIdParam) {
      nextParams.taskId = taskIdParam;
    }
    setSearchParams(nextParams);
  };

  const handleTaskChange = (taskId: string) => {
    setSelectedTaskId(taskId);
    setSearchParams({ tab: activeTab, taskId });
  };

  // Standings Mode
  const [standingsMode, setStandingsMode] = useState<'task' | 'overall'>('task');
  const [leaderboardMode, setLeaderboardMode] = useState<StandingsEntryMode>(() => {
    const m = searchParams.get('mode');
    return (m === 'both' || m === 'official' || m === 'virtual' || m === 'practice') ? m : 'both';
  });

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'initiating' | 'uploading' | 'completing' | 'done' | 'failed'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: contest } = useQuery<Contest>({
    queryKey: ['contest', contestId],
    queryFn: () => api.getContest(contestId!),
    enabled: !!contestId,
  });

  const { data: phaseDefs = [] } = useQuery<PhaseDef[]>({
    queryKey: ['phaseDefs', contestId],
    queryFn: () => api.getPhaseDefs(contestId!),
    enabled: !!contestId,
  });

  const { data: entries = [] } = useQuery<ContestEntry[]>({
    queryKey: ['entries', contestId],
    queryFn: () => api.getEntries(contestId!),
    enabled: !!contestId && !!user,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', contestId],
    queryFn: () => api.getTasks(contestId!),
    enabled: !!contestId,
  });

  const currentDef = phaseDefs.find(d => d.key === phaseKey);

  // Load user's teams
  const { data: myTeams = [] } = useQuery<Team[]>({
    queryKey: ['myTeams'],
    queryFn: () => api.getMyTeams(),
    enabled: !!user,
  });

  const userEntries = entries.filter(
    e => e.user_id === user?.id || 
         e.registered_by === user?.id || 
         (e.team_id && myTeams.some(t => t.id === e.team_id))
  );

  const activeMode = searchParams.get('mode') || 'official';
  const userEntry = userEntries.find(e => e.entry_mode === activeMode) || userEntries[0];

  // Helper to compute active phase times based on participation mode
  const getPhaseTimes = (phase: Phase | null) => {
    if (!phase) return null;
    let openTime = new Date(phase.open_time);
    let closeTime = new Date(phase.close_time);
    let modeText = 'Official Timeline';

    if (userEntry?.entry_mode === 'virtual' && userEntry.start_at && contest) {
      const contestStart = new Date(contest.start_time).getTime();
      const phaseOpen = new Date(phase.open_time).getTime();
      const phaseClose = new Date(phase.close_time).getTime();
      const phaseOpenOffset = phaseOpen - contestStart;
      const phaseCloseOffset = phaseClose - contestStart;

      const virtualStartAt = new Date(userEntry.start_at).getTime();
      openTime = new Date(virtualStartAt + phaseOpenOffset);
      closeTime = new Date(virtualStartAt + phaseCloseOffset);
      modeText = 'Virtual Timeline';
    } else if (userEntry?.entry_mode === 'practice') {
      modeText = 'Practice Timeline';
    }

    const now = new Date();
    const isLocked = now < openTime;
    const isEnded = userEntry?.entry_mode === 'practice' ? false : now > closeTime;

    return { openTime, closeTime, isLocked, isEnded, modeText };
  };

  // Fetch all phases for the tasks to match the current PhaseDef ID
  const { data: taskPhasesMap = {} } = useQuery<{ [taskId: string]: Phase }>({
    queryKey: ['taskPhases', contestId, currentDef?.id],
    queryFn: async () => {
      const mapping: { [taskId: string]: Phase } = {};
      if (!currentDef) return mapping;
      for (const t of tasks) {
        try {
          const phasesList = await api.getPhasesByTask(t.id);
          const matched = phasesList.find(p => p.contest_phase_def_id === currentDef.id);
          if (matched) {
            mapping[t.id] = matched;
          }
        } catch (e) {
          console.error(`Failed to load phase for task ${t.id}`, e);
        }
      }
      return mapping;
    },
    enabled: tasks.length > 0 && !!currentDef,
  });

  // Query submissions for the user entry
  const { data: submissions = [] } = useQuery<Submission[]>({
    queryKey: ['submissions', userEntry?.id],
    queryFn: () => api.getSubmissionsByEntry(userEntry!.id),
    enabled: !!userEntry,
    refetchInterval: (query) => {
      const data = query.state.data as Submission[] | undefined;
      const hasRunning = data?.some(s => ['uploaded', 'validating', 'queued', 'running'].includes(s.status));
      return hasRunning ? 3000 : false; // Poll every 3 seconds if active submissions
    }
  });

  // Selected task phase details
  const activePhase = selectedTaskId ? taskPhasesMap[selectedTaskId] : null;

  // Query standings
  const { data: leaderboard = [], refetch: refetchLeaderboard } = useQuery<LeaderboardRow[]>({
    queryKey: ['leaderboard', activePhase?.id, leaderboardMode],
    queryFn: () => api.getTaskPhaseLeaderboard(activePhase!.id, leaderboardMode === 'both' ? undefined : leaderboardMode),
    enabled: !!activePhase && activeTab === 'standings',
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Query overall phase standings
  const { data: overallLeaderboard = [], refetch: refetchOverallLeaderboard } = useQuery<LeaderboardRow[]>({
    queryKey: ['overallLeaderboard', contestId, currentDef?.id, leaderboardMode],
    queryFn: () => api.getContestPhaseLeaderboard(contestId!, currentDef!.id, leaderboardMode === 'both' ? undefined : leaderboardMode),
    enabled: !!contestId && !!currentDef && activeTab === 'standings' && standingsMode === 'overall',
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Set default selected task (checking URL query parameters first)
  useEffect(() => {
    if (tasks.length > 0) {
      const taskIdParam = searchParams.get('taskId');
      if (taskIdParam && tasks.some(t => t.id === taskIdParam)) {
        if (selectedTaskId !== taskIdParam) {
          setSelectedTaskId(taskIdParam);
        }
      } else if (!selectedTaskId) {
        setSelectedTaskId(tasks[0].id);
      }
    }
  }, [tasks, selectedTaskId, searchParams]);

  // Mutations
  const submitPredictionMutation = useMutation({
    mutationFn: async ({ file, taskId, phaseId }: { file: File, taskId: string, phaseId: string }) => {
      if (!userEntry) throw new Error('No active entry');
      setUploadProgress('initiating');

      const uploadFilename = file.name;
      const contentType = artifactContentType(file);

      // 1. Initiate
      const initRes = await api.initiateSubmission(userEntry.id, {
        task_id: taskId,
        phase_id: phaseId,
        files: [{
          filename: uploadFilename,
          content_type: contentType,
          size_bytes: file.size,
        }]
      });

      const uploadInfo = initRes.uploads[0];
      setUploadProgress('uploading');

      // 2. Upload to S3
      await axios.put(uploadInfo.put_url, file, {
        headers: {
          'Content-Type': contentType,
        }
      });

      setUploadProgress('completing');

      // 3. Complete
      const completedSub = await api.completeSubmission(initRes.submission_id, {
        files: [{
          filename: uploadFilename,
          object_key: uploadInfo.object_key,
          size_bytes: file.size,
          content_type: contentType,
        }]
      });

      return completedSub;
    },
    onSuccess: () => {
      setUploadProgress('done');
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['submissions', userEntry?.id] });
      setTimeout(() => {
        setUploadProgress('idle');
        setActiveTab('submissions'); // Switch to view run queue
      }, 1000);
    },
    onError: (err: any) => {
      console.error(err);
      setUploadProgress('failed');
      setUploadError(err?.response?.data?.message || err?.message || 'File upload or submission failed.');
    }
  });

  const markFinalMutation = useMutation({
    mutationFn: (subId: string) => api.markFinalSubmission(subId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions', userEntry?.id] });
      refetchLeaderboard();
      refetchOverallLeaderboard();
    }
  });

  const recomputeLeaderboardMutation = useMutation({
    mutationFn: (phaseId: string) => api.recomputeTaskPhaseLeaderboard(phaseId),
    onSuccess: () => {
      refetchLeaderboard();
    }
  });

  const recomputeOverallLeaderboardMutation = useMutation({
    mutationFn: () => api.recomputeContestPhaseLeaderboard(contestId!, currentDef!.id),
    onSuccess: () => {
      refetchOverallLeaderboard();
    }
  });

  const freezePhaseMutation = useMutation({
    mutationFn: (phaseId: string) => api.freezePhase(phaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskPhases', contestId, currentDef?.id] });
      refetchLeaderboard();
    }
  });

  const unfreezePhaseMutation = useMutation({
    mutationFn: (phaseId: string) => api.unfreezePhase(phaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskPhases', contestId, currentDef?.id] });
      refetchLeaderboard();
    }
  });

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTaskId) return;
    if (file.type !== 'application/pdf') {
      alert('Only PDF files are accepted.');
      return;
    }
    try {
      setUploadingPdf(true);
      await api.uploadTaskStatement(selectedTaskId, file);
      queryClient.invalidateQueries({ queryKey: ['tasks', contestId] });
      alert('Problem statement PDF uploaded successfully.');
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      alert(error?.response?.data?.message || 'Could not upload the problem statement file.');
    } finally {
      setUploadingPdf(false);
      if (pdfInputRef.current) {
        pdfInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadError(null);
    }
  };

  const triggerUpload = () => {
    if (!selectedFile || !selectedTaskId || !activePhase) {
      setUploadError('Please select a file first.');
      return;
    }
    submitPredictionMutation.mutate({
      file: selectedFile,
      taskId: selectedTaskId,
      phaseId: activePhase.id
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'uploaded': return <span className="badge badge-info">Uploaded</span>;
      case 'validating': return <span className="badge badge-warning">Validating</span>;
      case 'queued': return <span className="badge badge-warning">Queued</span>;
      case 'running': return <span className="badge badge-info" style={{ backgroundColor: 'hsla(199, 89%, 96%, 1)' }}>Running</span>;
      case 'done': return <span className="badge badge-success">Done</span>;
      case 'failed': return <span className="badge badge-danger">Failed</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const phaseTitle = getPhaseLabel(currentDef, phaseKey);
  const sortedSubmissions = [...submissions].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  const doneSubmissions = submissions.filter(sub => sub.status === 'done');
  const runningSubmissions = submissions.filter(sub => ['uploaded', 'validating', 'queued', 'running'].includes(sub.status));
  const finalSubmission = submissions.find(sub => sub.is_final);
  const formatRawScore = (score: number | string | null) => {
    if (score === null || score === '') return '-';
    const numericScore = typeof score === 'number' ? score : Number(score);
    if (!Number.isFinite(numericScore)) return '-';
    return Number.isInteger(numericScore) ? String(numericScore) : numericScore.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  };
  const formatFileSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div className="page-header-row">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <Link to={`/contests/${contestId}`} className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.45rem 0.8rem', fontSize: '0.85rem' }}>
              <ArrowLeft size={14} /> Back
            </Link>
            <div>
              <h1 className="page-title">{contest?.title || 'Contest'}</h1>
              <p className="page-subtitle" style={{ fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>
                {phaseTitle}
              </p>
            </div>
          </div>
          <div className="font-mono text-muted" style={{ fontSize: '0.85rem', paddingTop: '0.35rem' }}>
            {new Date().toLocaleString()}
          </div>
        </div>
      </div>

      {/* Participation Mode Banner */}
      {userEntry && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius)',
          marginBottom: '1.5rem',
          backgroundColor: userEntry.entry_mode === 'official' ? 'hsla(var(--primary), 0.05)' : userEntry.entry_mode === 'virtual' ? 'hsla(var(--warning), 0.05)' : 'hsla(var(--success), 0.05)',
          border: userEntry.entry_mode === 'official' ? '1px solid hsl(var(--primary))' : userEntry.entry_mode === 'virtual' ? '1px solid hsl(var(--warning))' : '1px solid hsl(var(--success))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.9rem'
        }}>
          <div>
            You are participating in <strong>{userEntry.entry_mode.toUpperCase()}</strong> mode.
            {userEntry.entry_mode === 'virtual' && userEntry.start_at && userEntry.end_at && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }} className="text-muted">
                (Virtual timer: {new Date(userEntry.start_at).toLocaleString()} to {new Date(userEntry.end_at).toLocaleString()})
              </span>
            )}
            {userEntry.entry_mode === 'practice' && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }} className="text-muted">
                (Practice submissions do not affect official standings rankings)
              </span>
            )}
          </div>
          {userEntries.length > 1 && (
            <div className="flex items-center gap-2">
              <label style={{ fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>Mode:</label>
              <select
                className="form-input"
                style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', height: 'auto', width: 'fit-content', margin: 0 }}
                value={activeMode}
                onChange={(e) => {
                  setSearchParams({ tab: activeTab, mode: e.target.value });
                  setLeaderboardMode(e.target.value as any);
                }}
              >
                {userEntries.map(e => (
                  <option key={e.id} value={e.entry_mode} style={{ textTransform: 'capitalize' }}>
                    {e.entry_mode} Mode
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Tab bar navigation */}
      <div className="tab-bar" style={{ marginBottom: '1.25rem' }}>
        <div className={`tab-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => handleTabChange('overview')}>
          Overview
        </div>
        <div className={`tab-item ${activeTab === 'problems' ? 'active' : ''}`} onClick={() => handleTabChange('problems')}>
          Problems
        </div>
        <div className={`tab-item ${activeTab === 'submissions' ? 'active' : ''}`} onClick={() => handleTabChange('submissions')}>
          Submission History
        </div>
        <div className={`tab-item ${activeTab === 'standings' ? 'active' : ''}`} onClick={() => handleTabChange('standings')}>
          Standings
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
          {/* Rules and Policies */}
          <div className="panel" style={{ lineHeight: '1.7' }}>
            <h2>Phase Rules & Policy</h2>
            <p>Welcome to the <strong>{phaseKey?.replace('_', ' ')}</strong> phase of {contest?.title}.</p>
            <hr style={{ margin: '1rem 0', borderColor: 'hsl(var(--border))' }} />
            <h3>System Policies</h3>
            <ul>
              <li>Submissions must match the artifact contract defined by each task.</li>
              <li>Each submission is automatically run against the evaluation containers.</li>
              <li>Standings show ranks based on your selected <strong>Final</strong> submission. You can mark any successful run as your final candidate.</li>
              <li>WebSockets/polling updates status in real-time.</li>
            </ul>
          </div>

          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h3 style={{ margin: 0 }}>Phase Details</h3>
            <div style={{ display: 'grid', gap: '0.65rem', fontSize: '0.86rem' }}>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Phase</span>
                <strong style={{ textAlign: 'right' }}>{phaseTitle}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Tasks</span>
                <strong>{tasks.length}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Mode</span>
                <strong style={{ textTransform: 'capitalize' }}>{userEntry?.entry_mode || 'Guest'}</strong>
              </div>
              {activePhase && (() => {
                const times = getPhaseTimes(activePhase);
                return times ? (
                  <>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">Timeline</span>
                      <strong>{times.modeText}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">Opens</span>
                      <span className="font-mono" style={{ textAlign: 'right' }}>{times.openTime.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">Closes</span>
                      <span className="font-mono" style={{ textAlign: 'right' }}>{times.closeTime.toLocaleString()}</span>
                    </div>
                  </>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Problems/Tasks Tab */}
      {activeTab === 'problems' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) 360px', gap: '1.25rem', alignItems: 'start' }}>
          {/* Left Column: task list */}
          <div className="panel" style={{ padding: 0, overflow: 'hidden', margin: 0 }}>
            <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid hsl(var(--border))', fontWeight: 750 }}>
              Problem List
            </div>
            <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {tasks.map((task, index) => {
                const active = selectedTaskId === task.id;
                const letter = String.fromCharCode(65 + index);
                return (
                  <button
                    key={task.id}
                    onClick={() => handleTaskChange(task.id)}
                    style={{
                      border: active ? '1px solid hsla(var(--primary), 0.25)' : '1px solid transparent',
                      borderLeft: active ? '4px solid hsl(var(--primary))' : '4px solid transparent',
                      backgroundColor: active ? 'hsla(var(--primary), 0.06)' : '#ffffff',
                      borderRadius: 'var(--radius)',
                      padding: '0.85rem 0.9rem',
                      display: 'grid',
                      gridTemplateColumns: '34px 1fr',
                      gap: '0.75rem',
                      alignItems: 'center',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: active ? 'hsl(var(--primary))' : 'hsl(var(--text-main))',
                    }}
                  >
                    <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1 }}>{letter}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{task.title}</div>
                      <div style={{ color: active ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                        {task.score_label || 'Task'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedTask?.problem_statement_url && (
              <div style={{ padding: '0 0.75rem 0.9rem 0.75rem' }}>
                <a href={getPdfUrl(selectedTask.problem_statement_url)} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <FileText size={15} /> Open Statement PDF
                </a>
              </div>
            )}
          </div>

          {/* Middle Column: statement */}
          <div className="panel" style={{ minHeight: '680px', padding: '1.5rem', margin: 0 }}>
            {selectedTask ? (
              <div>
                <div className="flex justify-between items-start" style={{ borderBottom: '1px solid hsl(var(--border))', paddingBottom: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      {String.fromCharCode(65 + Math.max(0, tasks.findIndex(task => task.id === selectedTask.id)))}. {selectedTask.title}
                    </h2>
                    {selectedTask.score_label && (
                      <div className="flex gap-2 flex-wrap" style={{ marginTop: '0.55rem' }}>
                        <span className="badge badge-info">Score metric: {selectedTask.score_label}</span>
                      </div>
                    )}
                  </div>

                  {(isAdmin || isJury) && (
                    <div>
                      <input type="file" ref={pdfInputRef} accept="application/pdf" style={{ display: 'none' }} onChange={handlePdfUpload} />
                      <button onClick={() => pdfInputRef.current?.click()} className="btn btn-secondary" style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }} disabled={uploadingPdf}>
                        <UploadCloud size={14} /> {selectedTask.problem_statement_url ? 'Update PDF' : 'Upload PDF'}
                      </button>
                    </div>
                  )}
                </div>

                {uploadingPdf && (
                  <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>Uploading problem statement PDF...</div>
                )}

                <section style={{ color: '#334155', fontSize: '0.95rem', lineHeight: 1.7 }}>
                  <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0' }}>Description</h3>
                  <p style={{ whiteSpace: 'pre-line', marginTop: 0 }}>
                    {selectedTask.description || 'No detailed task description has been provided.'}
                  </p>

                  {selectedTask.dataset_url && (
                    <div style={{ marginTop: '1rem' }}>
                      <h3 style={{ fontSize: '1rem', margin: '0 0 0.45rem 0' }}>Dataset</h3>
                      <a href={selectedTask.dataset_url} target="_blank" rel="noreferrer">{selectedTask.dataset_url}</a>
                    </div>
                  )}

                  {selectedTask.problem_statement_url && (
                    <div style={{ marginTop: '1.25rem', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                      <iframe src={getPdfUrl(selectedTask.problem_statement_url)} width="100%" height="420" style={{ border: 'none', display: 'block' }} title="Problem Statement PDF" />
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div style={{ minHeight: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-muted))' }}>
                Select a problem from the list on the left.
              </div>
            )}
          </div>

          {/* Right Column: Submit */}
          <div className="flex flex-col gap-4" style={{ minWidth: 0 }}>
            {selectedTask && (
              <div className="panel" style={{ padding: '1.1rem', margin: 0 }}>
                <h3 style={{ fontSize: '1rem', margin: '0 0 0.9rem 0', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <UploadCloud size={18} style={{ color: 'hsl(var(--primary))' }} /> Submit Solution
                </h3>

                {activePhase ? (() => {
                  const times = getPhaseTimes(activePhase);
                  if (!times) return null;
                  if (times.isLocked) return <div className="alert alert-warning" style={{ margin: 0, fontSize: '0.8rem' }}>This phase opens at <strong>{times.openTime.toLocaleString()}</strong>.</div>;
                  if (times.isEnded) return <div className="alert alert-danger" style={{ margin: 0, fontSize: '0.8rem' }}>The submission window is closed.</div>;
                  if (!userEntry) return <div className="alert alert-warning" style={{ margin: 0, fontSize: '0.8rem' }}>Register for this contest before submitting.</div>;

                  const contract = contractForPhase(selectedTask, activePhase.is_final);
                  const examples = contract?.examples || [];

                  return (
                    <div className="flex flex-col gap-3">
                      <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.8rem', lineHeight: 1.55 }}>
                        <strong>Submission contract:</strong>
                        <div>{contract?.description || 'No submission contract description is configured for this phase.'}</div>
                        {examples.length > 0 && <div className="font-mono" style={{ marginTop: '0.25rem' }}>Examples: {examples.join(', ')}</div>}
                      </div>

                      {uploadError && <div className="alert alert-danger" style={{ fontSize: '0.8rem', padding: '0.55rem' }}>{uploadError}</div>}

                      <div className="dropzone" onClick={() => fileInputRef.current?.click()} style={{ padding: '1.8rem 1rem', border: '2px dashed hsl(var(--border-dark))', backgroundColor: '#fff' }}>
                        <UploadCloud size={32} style={{ color: 'hsl(var(--text-muted))', margin: '0 auto 0.6rem auto' }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block' }}>Drop a file here or click to choose</span>
                        <span style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))' }}>Artifact for the current phase contract</span>
                        <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
                      </div>

                      {selectedFile && (
                        <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '0.65rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span className="font-mono" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{selectedFile.name}</span>
                          <button onClick={triggerUpload} className="btn btn-primary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }} disabled={uploadProgress !== 'idle'}>
                            <Play size={12} /> Submit
                          </button>
                        </div>
                      )}

                      {uploadProgress !== 'idle' && (
                        <div style={{ textAlign: 'center', padding: '0.4rem 0' }}>
                          <div className="spinner" style={{ margin: '0 auto 0.35rem auto', width: '1.2rem', height: '1.2rem', borderWidth: '2px' }}></div>
                          <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>Status: {uploadProgress.toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  );
                })() : <div className="alert alert-danger" style={{ fontSize: '0.8rem' }}>No phase configuration was found for this task.</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submissions Tab */}
      {activeTab === 'submissions' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="panel" style={{ padding: '1rem 1.25rem', margin: 0 }}>
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 style={{ margin: 0 }}>Submission History</h3>
                <p className="text-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '0.86rem' }}>
                  Raw scores are shown here. Scaled scores are only applied in standings.
                </p>
              </div>
              {runningSubmissions.length > 0 && (
                <span className="flex items-center gap-2 text-muted" style={{ fontSize: '0.8rem' }}>
                  <RefreshCw size={14} className="spinner" /> Polling queue...
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
              <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '0.75rem', backgroundColor: 'hsl(var(--background))' }}>
                <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Total Runs</div>
                <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 800 }}>{submissions.length}</div>
              </div>
              <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '0.75rem', backgroundColor: 'hsl(var(--background))' }}>
                <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Completed</div>
                <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 800 }}>{doneSubmissions.length}</div>
              </div>
              <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '0.75rem', backgroundColor: 'hsl(var(--background))' }}>
                <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>In Queue</div>
                <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 800 }}>{runningSubmissions.length}</div>
              </div>
              <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '0.75rem', backgroundColor: 'hsl(var(--background))' }}>
                <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Final Raw Score</div>
                <div className="font-mono" style={{ fontSize: '1.35rem', fontWeight: 800 }}>{finalSubmission ? formatRawScore(finalSubmission.raw_score) : '-'}</div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ padding: 0, margin: 0, overflow: 'hidden' }}>
            {submissions.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                You have not made any submissions in this contest yet.
              </div>
            ) : (
              <div className="table-container" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, marginBottom: 0 }}>
                <table className="oj-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                  <colgroup>
                    <col style={{ width: '180px' }} />
                    <col style={{ width: '360px' }} />
                    <col />
                    <col style={{ width: '112px' }} />
                    <col style={{ width: '112px' }} />
                    <col style={{ width: '104px' }} />
                    <col style={{ width: '108px' }} />
                    <col style={{ width: '88px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Submitted At</th>
                      <th>Problem</th>
                      <th aria-label="spacing"></th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Raw Score</th>
                      <th style={{ textAlign: 'right' }}>Size</th>
                      <th>Final</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSubmissions.map(sub => {
                      const task = tasks.find(t => t.id === sub.task_id);
                      return (
                        <tr key={sub.id} style={{ backgroundColor: sub.is_final ? 'hsl(var(--success-bg))' : undefined }}>
                          <td className="font-mono" style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', whiteSpace: 'nowrap' }}>
                            {new Date(sub.submitted_at).toLocaleString()}
                          </td>
                          <td style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task?.title || sub.task_id}</div>
                            {task?.score_label && (
                              <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: '0.15rem' }}>{task.score_label}</div>
                            )}
                          </td>
                          <td aria-label="spacing"></td>
                          <td>{getStatusBadge(sub.status)}</td>
                          <td className="font-mono" style={{ fontWeight: 800, color: sub.status === 'done' ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {sub.status === 'done' ? formatRawScore(sub.raw_score) : '-'}
                          </td>
                          <td className="font-mono" style={{ fontSize: '0.82rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {formatFileSize(sub.total_size_bytes)}
                          </td>
                          <td>
                            {sub.is_final ? (
                              <span className="badge badge-success flex items-center gap-1" style={{ width: 'fit-content' }}>
                                <Star size={12} fill="currentColor" /> Final
                              </span>
                            ) : (
                              <span className="badge badge-secondary" style={{ color: 'hsl(var(--text-muted))' }}>Alt</span>
                            )}
                          </td>
                          <td>
                            {!sub.is_final && sub.status === 'done' ? (
                              <button
                                onClick={() => markFinalMutation.mutate(sub.id)}
                                className="btn btn-secondary flex items-center gap-1"
                                style={{ padding: '0.25rem 0.45rem', fontSize: '0.72rem' }}
                                disabled={markFinalMutation.isPending}
                                title="Set as final submission"
                              >
                                <Star size={12} /> Final
                              </button>
                            ) : sub.status === 'failed' && sub.error_message ? (
                              <span className="badge badge-danger" title={sub.error_message}>
                                Error
                              </span>
                            ) : (
                              <span className="text-muted font-mono" style={{ fontSize: '0.8rem' }}>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standings Tab */}
      {activeTab === 'standings' && (
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-header" style={{ padding: '1rem 1.5rem', marginBottom: 0 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>
                {standingsMode === 'task'
                  ? (selectedTask ? `${selectedTask.title} Leaderboard` : 'Task Leaderboard')
                  : 'Overall Phase Standings'}
              </span>
              <span className="badge badge-secondary" style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                {leaderboardMode === 'both' ? 'Both Modes' : `${leaderboardMode} Mode`}
              </span>
            </h3>
            <div className="flex gap-2">
              {(isAdmin || isJury) && activePhase && standingsMode === 'task' && (
                <button
                  onClick={() => {
                    if (activePhase.is_frozen) {
                      unfreezePhaseMutation.mutate(activePhase.id);
                    } else {
                      freezePhaseMutation.mutate(activePhase.id);
                    }
                  }}
                  className={`btn ${activePhase.is_frozen ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2`}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  disabled={freezePhaseMutation.isPending || unfreezePhaseMutation.isPending}
                >
                  {activePhase.is_frozen ? <Unlock size={14} /> : <Lock size={14} />}
                  {activePhase.is_frozen ? 'Unfreeze Standings' : 'Freeze Standings'}
                </button>
              )}

              {(isAdmin || isJury) && activePhase && standingsMode === 'task' && (
                <button
                  onClick={() => recomputeLeaderboardMutation.mutate(activePhase.id)}
                  className="btn btn-secondary flex items-center gap-2"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  disabled={recomputeLeaderboardMutation.isPending}
                >
                  <RefreshCw size={14} className={recomputeLeaderboardMutation.isPending ? 'spinner' : ''} />
                  Recompute Task Board
                </button>
              )}

              {(isAdmin || isJury) && standingsMode === 'overall' && currentDef && (
                <button
                  onClick={() => recomputeOverallLeaderboardMutation.mutate()}
                  className="btn btn-secondary flex items-center gap-2"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  disabled={recomputeOverallLeaderboardMutation.isPending}
                >
                  <RefreshCw size={14} className={recomputeOverallLeaderboardMutation.isPending ? 'spinner' : ''} />
                  Recompute Overall Board
                </button>
              )}
            </div>
          </div>

          {/* Standings Mode Switcher */}
          <div className="flex flex-wrap gap-2 justify-between items-center" style={{ borderBottom: '1px solid hsl(var(--border))', padding: '0.75rem 1.5rem', backgroundColor: 'hsl(var(--background))', rowGap: '0.5rem' }}>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStandingsMode('overall')}
                className={`btn ${standingsMode === 'overall' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
              >
                Overall Standing
              </button>
              {tasks.filter(t => !!taskPhasesMap[t.id]).map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTaskId(t.id);
                    setStandingsMode('task');
                  }}
                  className={`btn ${standingsMode === 'task' && selectedTaskId === t.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                >
                  {t.title}
                </button>
              ))}
            </div>

            {/* Filter by Entry Mode (Official, Virtual, Practice) */}
            <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--text-muted))' }}>Mode:</span>
              <div className="flex gap-1" style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '0.15rem', backgroundColor: 'hsl(var(--background))' }}>
                {(['both', 'official', 'virtual', 'practice'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setLeaderboardMode(mode)}
                    className={`btn`}
                    style={{
                      padding: '0.2rem 0.6rem',
                      fontSize: '0.75rem',
                      textTransform: 'capitalize',
                      border: 'none',
                      backgroundColor: leaderboardMode === mode ? 'hsl(var(--primary))' : 'transparent',
                      color: leaderboardMode === mode ? 'white' : 'hsl(var(--text-main))',
                      boxShadow: 'none'
                    }}
                  >
                    {mode === 'both' ? 'Both' : mode}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Freeze Warning */}
          {standingsMode === 'task' && activePhase?.is_frozen && (
            <div className="alert alert-warning flex items-center gap-2" style={{ margin: '1rem 1.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
              <ShieldAlert size={16} />
              <span><strong>Standings Frozen:</strong> The jury has frozen this task board. Submissions are still accepted, but public rankings will not update.</span>
            </div>
          )}

          <div className="table-container" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, marginBottom: 0 }}>
            {((standingsMode === 'task' ? leaderboard : overallLeaderboard).length === 0) ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                No score rankings compiled yet for this standings view.
              </div>
            ) : (
              <table className="oj-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>Rank</th>
                    <th>Participant</th>
                    <th className="font-mono">Score</th>
                    <th style={{ width: '120px' }}>Run Count</th>
                    <th>Last Upload</th>
                  </tr>
                </thead>
                <tbody>
                  {(standingsMode === 'task' ? leaderboard : overallLeaderboard).map((row, index) => {
                    const isCurrentUser = row.user_emails?.includes(user?.email || '') || row.display_name === user?.full_name;
                    return (
                      <tr key={index} style={{ backgroundColor: isCurrentUser ? 'hsla(var(--primary), 0.04)' : undefined }}>
                        <td className="font-mono" style={{ fontWeight: 'bold' }}>{row.rank}</td>
                        <td style={{ fontWeight: 600 }}>{formatParticipantName(row)}</td>
                        <td className="font-mono" style={{ fontWeight: 'bold', color: 'hsl(var(--primary))' }}>
                          {Number(row.score || 0).toFixed(6)}
                        </td>
                        <td className="font-mono">{row.entries_count}</td>
                        <td className="font-mono" style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                          {new Date(row.updated_at).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
