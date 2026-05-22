import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api, type Contest, type PhaseDef, type Task, type Phase, type ContestEntry, type Submission, type LeaderboardRow, type Clarification, type Announcement, type Ticket, type Team } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import {
  FileText, UploadCloud, Play, AlertCircle, RefreshCw, ArrowLeft, Star, Volume2, ShieldAlert, Lock, Unlock, Settings
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

export const PhaseHubPage: React.FC = () => {
  const { contestId, phaseKey } = useParams<{ contestId: string, phaseKey: string }>();
  const { user, isAdmin, isJury } = useAuth();
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState<'overview' | 'problems' | 'submissions' | 'standings' | 'clarifications' | 'tickets'>(() => {
    const validTabs = ['overview', 'problems', 'submissions', 'standings', 'clarifications', 'tickets'];
    return (tabParam && validTabs.includes(tabParam)) ? (tabParam as any) : 'overview';
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Sync activeTab state with URL parameter if it changes
  useEffect(() => {
    const validTabs = ['overview', 'problems', 'submissions', 'standings', 'clarifications', 'tickets'];
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

  // Support Ticket Form State
  const [ticketCategory, setTicketCategory] = useState<'upload' | 'judge' | 'score' | 'system'>('system');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketSubmissionId, setTicketSubmissionId] = useState('');
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'initiating' | 'uploading' | 'completing' | 'done' | 'failed'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Q&A Form State
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaTaskId, setQaTaskId] = useState<string>('');
  const [qaError, setQaError] = useState<string | null>(null);

  // Clarification Answer Form State
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [qaAnswer, setQaAnswer] = useState('');
  const [isPublicAnswer, setIsPublicAnswer] = useState(true);

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

  const userEntry = entries.find(
    e => e.user_id === user?.id || 
         e.registered_by === user?.id || 
         (e.team_id && myTeams.some(t => t.id === e.team_id))
  );

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
    queryKey: ['leaderboard', activePhase?.id],
    queryFn: () => api.getTaskPhaseLeaderboard(activePhase!.id),
    enabled: !!activePhase && activeTab === 'standings',
  });

  // Query clarifications
  const { data: clarifications = [], refetch: refetchClarifications } = useQuery<Clarification[]>({
    queryKey: ['clarifications', contestId],
    queryFn: () => api.getClarifications(contestId!),
    enabled: !!contestId && activeTab === 'clarifications',
  });

  // Query overall phase standings
  const { data: overallLeaderboard = [], refetch: refetchOverallLeaderboard } = useQuery<LeaderboardRow[]>({
    queryKey: ['overallLeaderboard', contestId, currentDef?.id],
    queryFn: () => api.getContestPhaseLeaderboard(contestId!, currentDef!.id),
    enabled: !!contestId && !!currentDef && activeTab === 'standings' && standingsMode === 'overall',
  });

  // Query contestant tickets
  const { data: myTickets = [], refetch: refetchMyTickets } = useQuery<Ticket[]>({
    queryKey: ['myTickets'],
    queryFn: () => api.listMyTickets(),
    enabled: !!user && activeTab === 'tickets',
  });

  // Query announcements
  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ['announcements', contestId],
    queryFn: () => api.getAnnouncements(contestId!),
    enabled: !!contestId,
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

      const uploadFilename = activePhase?.is_final ? file.name : 'predictions.csv';

      // 1. Initiate
      const initRes = await api.initiateSubmission(userEntry.id, {
        task_id: taskId,
        phase_id: phaseId,
        files: [{
          filename: uploadFilename,
          content_type: file.type || 'text/csv',
          size_bytes: file.size,
        }]
      });

      const uploadInfo = initRes.uploads[0];
      setUploadProgress('uploading');

      // 2. Upload to S3
      await axios.put(uploadInfo.put_url, file, {
        headers: {
          'Content-Type': file.type || 'text/csv',
        }
      });

      setUploadProgress('completing');

      // 3. Complete
      const completedSub = await api.completeSubmission(initRes.submission_id, {
        files: [{
          filename: uploadFilename,
          object_key: uploadInfo.object_key,
          size_bytes: file.size,
          content_type: file.type || 'text/csv',
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

  const createQaMutation = useMutation({
    mutationFn: (payload: any) => api.createClarification(contestId!, payload, userEntry?.id),
    onSuccess: () => {
      setQaQuestion('');
      setQaTaskId('');
      refetchClarifications();
    },
    onError: (err: any) => {
      setQaError(err?.response?.data?.message || 'Failed to submit clarification.');
    }
  });

  const answerQaMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string, payload: any }) => api.answerClarification(id, payload),
    onSuccess: () => {
      setAnsweringId(null);
      setQaAnswer('');
      refetchClarifications();
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

  const createTicketMutation = useMutation({
    mutationFn: (payload: any) => api.createTicket(payload),
    onSuccess: () => {
      setTicketSubject('');
      setTicketDescription('');
      setTicketSubmissionId('');
      setTicketSuccess('Support ticket submitted successfully!');
      setTicketError(null);
      refetchMyTickets();
      setTimeout(() => setTicketSuccess(null), 3500);
    },
    onError: (err: any) => {
      setTicketError(err?.response?.data?.message || 'Failed to submit support ticket.');
      setTicketSuccess(null);
    }
  });

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

  const handleQaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQaError(null);
    if (!qaQuestion.trim()) return;
    createQaMutation.mutate({
      task_id: qaTaskId || null,
      phase_id: activePhase?.id || null,
      question: qaQuestion,
    });
  };

  const handleAnswerSubmit = (clarificationId: string) => {
    if (!qaAnswer.trim()) return;
    answerQaMutation.mutate({
      id: clarificationId,
      payload: {
        answer: qaAnswer,
        is_public: isPublicAnswer
      }
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

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      {/* Contest header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to={`/contests/${contestId}`} className="btn btn-secondary flex items-center gap-2" style={{ width: 'fit-content', padding: '0.4rem 0.8rem', marginBottom: '1rem' }}>
          <ArrowLeft size={14} /> Back to Contest
        </Link>
        <div className="flex justify-between items-center">
          <div>
            <h1 style={{ marginBottom: '0.25rem', textTransform: 'capitalize' }}>
              {contest?.title} — {phaseKey?.replace('_', ' ')}
            </h1>
            <p className="text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
              Work area for submitted predictions and scoreboard validations.
            </p>
          </div>
        </div>
      </div>

      {/* Tab bar navigation */}
      <div className="tab-bar">
        <div className={`tab-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => handleTabChange('overview')}>
          Overview
        </div>
        <div className={`tab-item ${activeTab === 'problems' ? 'active' : ''}`} onClick={() => handleTabChange('problems')}>
          Tasks & Submit
        </div>
        <div className={`tab-item ${activeTab === 'submissions' ? 'active' : ''}`} onClick={() => handleTabChange('submissions')}>
          Submissions
        </div>
        <div className={`tab-item ${activeTab === 'standings' ? 'active' : ''}`} onClick={() => handleTabChange('standings')}>
          Standings
        </div>
        <div className={`tab-item ${activeTab === 'clarifications' ? 'active' : ''}`} onClick={() => handleTabChange('clarifications')}>
          Clarifications
        </div>
        <div className={`tab-item ${activeTab === 'tickets' ? 'active' : ''}`} onClick={() => handleTabChange('tickets')}>
          Support Tickets
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
              <li>Submissions must be format-compliant CSV predictions or scripts, according to task descriptions.</li>
              <li>Each submission is automatically run against the evaluation containers.</li>
              <li>Standings show ranks based on your selected <strong>Final</strong> submission. You can mark any successful run as your final candidate.</li>
              <li>WebSockets/polling updates status in real-time.</li>
            </ul>
          </div>

          {/* Announcements Timeline */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Volume2 size={18} /> Announcements
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '450px', overflowY: 'auto' }}>
              {announcements.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No announcements yet.</p>
              ) : (
                [...announcements]
                  .sort((a, b) => {
                    if (a.is_pinned && !b.is_pinned) return -1;
                    if (!a.is_pinned && b.is_pinned) return 1;
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                  })
                  .map(ann => (
                    <div
                      key={ann.id}
                      style={{
                        padding: '0.75rem',
                        borderRadius: 'var(--radius)',
                        border: ann.is_pinned ? '1px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
                        backgroundColor: ann.is_pinned ? 'hsla(var(--primary), 0.02)' : 'var(--background)'
                      }}
                    >
                      <div className="flex justify-between items-center" style={{ marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {ann.is_pinned && <span className="badge badge-primary" style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem' }}>PINNED</span>}
                          {ann.title}
                        </span>
                        <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                          {new Date(ann.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-line', lineHeight: '1.4', color: 'var(--text)' }}>
                        {ann.content}
                      </p>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Problems/Tasks Tab */}
      {activeTab === 'problems' && (
        <div className="grid-3-1" style={{ gridTemplateColumns: '1fr 3fr' }}>
          {/* Sidebar: tasks list */}
          <div className="flex flex-col gap-2">
            <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Tasks</h4>
            {tasks.map(t => (
              <button
                key={t.id}
                onClick={() => handleTaskChange(t.id)}
                className={`btn ${selectedTaskId === t.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ justifyContent: 'flex-start', textAlign: 'left', width: '100%' }}
              >
                <FileText size={16} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </span>
              </button>
            ))}
          </div>

          {/* Details & Upload panel */}
          <div>
            {selectedTask ? (
              <div className="panel">
                <div className="panel-header">
                  <h2 style={{ margin: 0 }}>{selectedTask.title}</h2>
                  <div className="badge badge-info">{selectedTask.score_label}</div>
                </div>

                <div style={{ marginBottom: '1.5rem', whiteSpace: 'pre-line' }}>
                  {selectedTask.description || 'No detailed description provided for this task.'}
                </div>

                {selectedTask.problem_statement_url && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <strong>Problem Resource:</strong>{' '}
                    <a href={selectedTask.problem_statement_url} target="_blank" rel="noreferrer">
                      View/Download Dataset & Guidelines
                    </a>
                  </div>
                )}

                <div style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', fontSize: '0.85rem', marginBottom: '2rem' }}>
                  <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
                    <div><strong>Score Direction:</strong> {selectedTask.higher_is_better ? 'Higher is better' : 'Lower is better'}</div>
                    {activePhase && (
                      <>
                        <div><strong>Submission Limit:</strong> {activePhase.submission_limit || 'Unlimited'}</div>
                        <div><strong>Scoreboard:</strong> {activePhase.leaderboard_mode} mode</div>
                        <div><strong>Open Time:</strong> {new Date(activePhase.open_time).toLocaleString()}</div>
                        <div><strong>Close Time:</strong> {new Date(activePhase.close_time).toLocaleString()}</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Upload section */}
                {activePhase ? (() => {
                  const now = new Date();
                  const isLocked = now < new Date(activePhase.open_time);
                  const isEnded = now > new Date(activePhase.close_time);

                  if (isLocked) {
                    return (
                      <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
                        This phase will open at <strong>{new Date(activePhase.open_time).toLocaleString()}</strong>. Submissions are currently locked.
                      </div>
                    );
                  }

                  if (isEnded) {
                    return (
                      <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
                        This phase ended at <strong>{new Date(activePhase.close_time).toLocaleString()}</strong>. Submissions are closed.
                      </div>
                    );
                  }

                  if (!userEntry) {
                    return (
                      <div className="alert alert-warning flex items-center gap-2" style={{ marginTop: '1rem' }}>
                        <ShieldAlert size={18} />
                        <div>
                          <strong>Chưa đăng ký tham gia:</strong> Bạn chưa đăng ký tham gia cuộc thi này hoặc không thuộc đội thi hợp lệ. Vui lòng đăng ký tham gia trước khi nộp bài.
                          <br />
                          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                            <strong>Not registered:</strong> You are not registered for this contest or do not belong to a valid team. Please register first.
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                        {activePhase.is_final ? 'Submit Inference Bundle' : 'Submit Predictions'}
                      </h3>
                      {uploadError && (
                        <div className="alert alert-danger flex items-center gap-2">
                          <AlertCircle size={18} />
                          <div>{uploadError}</div>
                        </div>
                      )}

                      <div className="dropzone" onClick={() => fileInputRef.current?.click()}>
                        <UploadCloud size={36} className="text-muted" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                        <p style={{ fontWeight: 600 }}>
                          {activePhase.is_final ? 'Click to select your code/model ZIP archive' : 'Click to select your prediction file'}
                        </p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {activePhase.is_final ? 'ZIP archive up to 100MB' : 'CSV or TSV files up to 50MB'}
                        </p>
                        <input
                          type="file"
                          ref={fileInputRef}
                          style={{ display: 'none' }}
                          accept={activePhase.is_final ? '.zip' : '.csv,.tsv'}
                          onChange={handleFileChange}
                        />
                      </div>

                      {selectedFile && (
                        <div style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', backgroundColor: 'var(--background)' }} className="flex justify-between items-center">
                          <div className="font-mono" style={{ fontSize: '0.85rem' }}>
                            {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                          </div>
                          <button
                            onClick={triggerUpload}
                            className="btn btn-primary flex items-center gap-2"
                            disabled={uploadProgress !== 'idle'}
                          >
                            <Play size={14} /> Submit
                          </button>
                        </div>
                      )}

                      {uploadProgress !== 'idle' && (
                        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                          <div className="spinner" style={{ margin: '0 auto 0.5rem auto' }}></div>
                          <p className="font-mono" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Status: <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{uploadProgress}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="alert alert-danger">
                    No phase configurations found for this task in the current contest window.
                  </div>
                )}
              </div>
            ) : (
              <p>Please select a task from the sidebar.</p>
            )}
          </div>
        </div>
      )}

      {/* Submissions Tab */}
      {activeTab === 'submissions' && (
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-header" style={{ padding: '1rem 1.5rem', marginBottom: 0 }}>
            <h3 style={{ margin: 0 }}>Your Submission History</h3>
            {submissions.some(s => ['uploaded', 'validating', 'queued', 'running'].includes(s.status)) && (
              <span className="flex items-center gap-2 text-muted" style={{ fontSize: '0.8rem' }}>
                <RefreshCw size={14} className="spinner" /> Polling queue...
              </span>
            )}
          </div>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, marginBottom: 0 }}>
            {submissions.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                You have not made any submissions in this contest yet.
              </div>
            ) : (
              <table className="oj-table">
                <thead>
                  <tr>
                    <th>Submitted At</th>
                    <th>Task ID</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Size</th>
                    <th>Finalist</th>
                    <th>Actions/Logs</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map(sub => (
                    <tr key={sub.id} style={{ opacity: sub.is_final ? 1 : 0.8 }}>
                      <td className="font-mono" style={{ fontSize: '0.85rem' }}>
                        {new Date(sub.submitted_at).toLocaleString()}
                      </td>
                      <td>
                        {tasks.find(t => t.id === sub.task_id)?.title || sub.task_id}
                      </td>
                      <td>
                        {getStatusBadge(sub.status)}
                      </td>
                      <td className="font-mono" style={{ fontWeight: 'bold' }}>
                        {sub.status === 'done' ? (sub.display_score || '0.00') : '-'}
                      </td>
                      <td className="font-mono" style={{ fontSize: '0.85rem' }}>
                        {(sub.total_size_bytes / 1024).toFixed(1)} KB
                      </td>
                      <td>
                        {sub.is_final ? (
                          <span className="badge badge-success flex items-center gap-1" style={{ width: 'fit-content' }}>
                            <Star size={12} fill="currentColor" /> Final
                          </span>
                        ) : (
                          <span className="text-muted font-mono" style={{ fontSize: '0.85rem' }}>Alternate</span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          {!sub.is_final && sub.status === 'done' && (
                            <button
                              onClick={() => markFinalMutation.mutate(sub.id)}
                              className="btn btn-secondary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              disabled={markFinalMutation.isPending}
                            >
                              Set as Final
                            </button>
                          )}
                          {sub.status === 'failed' && sub.error_message && (
                            <span className="text-danger" style={{ fontSize: '0.8rem', color: 'hsl(var(--danger))' }}>
                              {sub.error_message}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Standings Tab */}
      {activeTab === 'standings' && (
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-header" style={{ padding: '1rem 1.5rem', marginBottom: 0 }}>
            <h3 style={{ margin: 0 }}>
              {standingsMode === 'task'
                ? (selectedTask ? `${selectedTask.title} Leaderboard` : 'Task Leaderboard')
                : 'Overall Phase Standings'}
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
          <div className="flex gap-2" style={{ borderBottom: '1px solid hsl(var(--border))', padding: '0.75rem 1.5rem', backgroundColor: 'var(--background)' }}>
            <button
              onClick={() => setStandingsMode('task')}
              className={`btn ${standingsMode === 'task' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
            >
              Task Standing ({selectedTask?.title || 'Selected Task'})
            </button>
            <button
              onClick={() => setStandingsMode('overall')}
              className={`btn ${standingsMode === 'overall' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
            >
              Overall Phase Standing
            </button>
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
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                        <td className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
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

      {/* Clarifications Tab */}
      {activeTab === 'clarifications' && (
        <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
          {/* Thread list */}
          <div className="panel">
            <h3 style={{ marginBottom: '1.25rem' }}>Clarification History</h3>
            <div className="flex flex-col gap-4">
              {clarifications.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No clarifications requested yet.</p>
              ) : (
                clarifications.map(c => (
                  <div key={c.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '1rem', backgroundColor: '#fdfdfd' }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
                      <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                        {c.task_id ? (tasks.find(t => t.id === c.task_id)?.title || 'Task Specific') : 'General'}
                      </span>
                      <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                        {new Date(c.created_at).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="message-thread">
                      <div className="bubble bubble-question">
                        <strong>Q: </strong> {c.question}
                      </div>

                      {c.answer ? (
                        <div className="bubble bubble-answer">
                          <strong>Jury Reply: </strong> {c.answer}
                        </div>
                      ) : (
                        <div className="text-muted" style={{ fontSize: '0.8rem', fontStyle: 'italic', paddingLeft: '1rem' }}>
                          Pending response from the jury.
                        </div>
                      )}
                    </div>

                    {/* Admin Answer Box */}
                    {(isAdmin || isJury) && !c.answer && (
                      <div style={{ marginTop: '1rem', borderTop: '1px solid hsl(var(--border))', paddingTop: '0.75rem' }}>
                        {answeringId === c.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              className="form-input"
                              value={qaAnswer}
                              onChange={(e) => setQaAnswer(e.target.value)}
                              placeholder="Type response here..."
                            />
                            <div className="flex justify-between items-center">
                              <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <input
                                  type="checkbox"
                                  checked={isPublicAnswer}
                                  onChange={(e) => setIsPublicAnswer(e.target.checked)}
                                />
                                Make Public Announcement
                              </label>
                              <div className="flex gap-2">
                                <button onClick={() => setAnsweringId(null)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                  Cancel
                                </button>
                                <button onClick={() => handleAnswerSubmit(c.id)} className="btn btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                                  Send Answer
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAnsweringId(c.id);
                              setQaAnswer('');
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Answer Question
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Ask question form */}
          {!(isAdmin || isJury) && (
            <div className="panel">
              <h3 style={{ marginBottom: '1rem' }}>Ask Clarification</h3>
              {qaError && <div className="alert alert-danger" style={{ fontSize: '0.8rem' }}>{qaError}</div>}
              <form onSubmit={handleQaSubmit}>
                <div className="form-group">
                  <label className="form-label">Task Context</label>
                  <select
                    className="form-input"
                    value={qaTaskId}
                    onChange={(e) => setQaTaskId(e.target.value)}
                  >
                    <option value="">General / None</option>
                    {tasks.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Question *</label>
                  <textarea
                    className="form-input"
                    value={qaQuestion}
                    onChange={(e) => setQaQuestion(e.target.value)}
                    placeholder="Describe your issue or question clearly..."
                    required
                    style={{ height: '120px', resize: 'vertical' }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={createQaMutation.isPending}
                >
                  {createQaMutation.isPending ? 'Sending...' : 'Submit Question'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Support Tickets Tab */}
      {activeTab === 'tickets' && (
        (isAdmin || isJury) ? (
          <div className="panel flex flex-col items-center justify-center text-center" style={{ minHeight: '300px', borderStyle: 'dashed' }}>
            <Settings size={48} className="text-warning" style={{ color: 'hsl(var(--warning))', marginBottom: '1rem', opacity: 0.8 }} />
            <h3>Administrative Support Dispatcher</h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', maxWidth: '480px', margin: '0.5rem auto 1.5rem auto', lineHeight: '1.5' }}>
              You are logged in with organizer privileges. To assign, status-track, or resolve contestant technical tickets, please proceed to the Admin Panel.
            </p>
            <Link to={`/admin/contests/${contestId}/setup`} className="btn btn-primary flex items-center gap-2">
              <Settings size={16} /> Go to Admin Setup (Tickets)
            </Link>
          </div>
        ) : (
          <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
            {/* My Support Tickets List */}
            <div className="panel">
              <h3 style={{ marginBottom: '1.25rem' }}>Support Ticket History</h3>
              <div className="flex flex-col gap-4">
                {myTickets.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No support tickets submitted yet.</p>
                ) : (
                  myTickets.map(ticket => (
                    <div key={ticket.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '1rem', backgroundColor: '#fdfdfd' }}>
                      <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
                        <div className="flex items-center gap-2">
                          <span className="badge badge-info" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>
                            {ticket.category}
                          </span>
                          <span className={`badge ${
                            ticket.priority === 'urgent' || ticket.priority === 'high' ? 'badge-danger' : 'badge-secondary'
                          }`} style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>
                            {ticket.priority}
                          </span>
                        </div>
                        <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                          {new Date(ticket.created_at).toLocaleString()}
                        </span>
                      </div>

                      <h4 style={{ margin: '0.25rem 0', fontSize: '1rem' }}>{ticket.subject}</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text)', whiteSpace: 'pre-line', margin: '0.5rem 0' }}>
                        {ticket.description}
                      </p>

                      {ticket.submission_id && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                          <strong>Associated Submission:</strong> <code className="font-mono" style={{ fontSize: '0.7rem' }}>{ticket.submission_id}</code>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', borderTop: '1px solid hsl(var(--border))', paddingTop: '0.5rem', fontSize: '0.8rem' }}>
                        <div>
                          <strong>Status:</strong>{' '}
                          <span className={`badge ${
                            ticket.status === 'resolved' ? 'badge-success' : ticket.status === 'rejected' ? 'badge-danger' : ticket.status === 'in_progress' ? 'badge-info' : 'badge-warning'
                          }`} style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-muted">
                          {ticket.assigned_to ? `Assigned to: ${ticket.assigned_to}` : 'Awaiting Assignment'}
                        </div>
                      </div>

                      {ticket.resolved_at && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'hsl(var(--success))', fontStyle: 'italic' }}>
                          Resolved at {new Date(ticket.resolved_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Submit New Ticket Form */}
            <div className="panel">
              <h3 style={{ marginBottom: '1rem' }}>Submit Ticket</h3>
              
              {ticketError && (
                <div className="alert alert-danger" style={{ fontSize: '0.8rem', padding: '0.5rem', marginBottom: '1rem' }}>
                  {ticketError}
                </div>
              )}
              
              {ticketSuccess && (
                <div className="alert alert-success" style={{ fontSize: '0.8rem', padding: '0.5rem', marginBottom: '1rem' }}>
                  {ticketSuccess}
                </div>
              )}

              <form onSubmit={(e) => {
                e.preventDefault();
                setTicketError(null);
                setTicketSuccess(null);
                if (!userEntry) {
                  setTicketError('You must register for this contest to submit tickets.');
                  return;
                }
                if (!ticketSubject.trim() || !ticketDescription.trim()) {
                  setTicketError('Subject and Description are required.');
                  return;
                }
                createTicketMutation.mutate({
                  contest_entry_id: userEntry.id,
                  category: ticketCategory,
                  subject: ticketSubject,
                  description: ticketDescription,
                  submission_id: ticketSubmissionId || null
                });
              }}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-input"
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value as any)}
                  >
                    <option value="upload">Upload Issue</option>
                    <option value="judge">Jury Judge Issue</option>
                    <option value="score">Scoring Inconsistency</option>
                    <option value="system">General System Bug</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Linked Submission (Optional)</label>
                  <select
                    className="form-input"
                    value={ticketSubmissionId}
                    onChange={(e) => setTicketSubmissionId(e.target.value)}
                  >
                    <option value="">-- No Submission Linked --</option>
                    {submissions.map(sub => (
                      <option key={sub.id} value={sub.id}>
                        {new Date(sub.submitted_at).toLocaleTimeString()} - {tasks.find(t => t.id === sub.task_id)?.title || sub.task_id} (Score: {sub.display_score ?? 'N/A'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Subject *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    placeholder="Summarize the technical issue..."
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Detailed Description *</label>
                  <textarea
                    className="form-input"
                    value={ticketDescription}
                    onChange={(e) => setTicketDescription(e.target.value)}
                    placeholder="Provide precise details, steps to reproduce, or error messages..."
                    required
                    style={{ height: '120px', resize: 'vertical' }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={createTicketMutation.isPending}
                >
                  {createTicketMutation.isPending ? 'Submitting...' : 'Submit Support Ticket'}
                </button>
              </form>
            </div>
          </div>
        )
      )}
    </div>
  );
};
