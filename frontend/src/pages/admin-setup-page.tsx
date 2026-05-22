import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api, type Contest, type Task, type User, type ContestEntry, type PhaseDef, type Phase } from '../lib/api-client';
import {
  Settings, CheckCircle2, XCircle, Plus, Upload, ArrowLeft, Trash2, AlertTriangle
} from 'lucide-react';

export const AdminSetupPage: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Active Admin Sub-tab
  const [subTab, setSubTab] = useState<'checklist' | 'tasks' | 'entries' | 'settings' | 'users' | 'announcements' | 'tickets' | 'phases'>('checklist');

  // Announcements form state
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annIsPinned, setAnnIsPinned] = useState(false);
  const [annError, setAnnError] = useState<string | null>(null);
  const [annSuccess, setAnnSuccess] = useState<string | null>(null);
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);

  // Tickets filter state
  const [ticketFilterStatus, setTicketFilterStatus] = useState<string>('');

  // New Task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskSlug, setTaskSlug] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskScoreLabel, setTaskScoreLabel] = useState('Accuracy');
  const [taskHigherBetter, setTaskHigherBetter] = useState(true);
  const [taskSortOrder, setTaskSortOrder] = useState(1);
  const [taskError, setTaskError] = useState<string | null>(null);

  // Asset upload states
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'initiating' | 'uploading' | 'completing' | 'done' | 'failed'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Contest Edit Settings form state
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsStartTime, setSettingsStartTime] = useState('');
  const [settingsEndTime, setSettingsEndTime] = useState('');
  const [settingsEntryPolicy, setSettingsEntryPolicy] = useState<'individual' | 'team' | 'both'>('individual');
  const [settingsVisibility, setSettingsVisibility] = useState<'public' | 'private'>('public');
  const [settingsRequireApproval, setSettingsRequireApproval] = useState(false);
  const [settingsScaleScores, setSettingsScaleScores] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  // Phase Definitions global config state
  const [editingPhaseDefIdRef, setEditingPhaseDefIdRef] = useState<string | null>(null);
  const [editingPhaseDefTitle, setEditingPhaseDefTitle] = useState('');
  const [editingPhaseDefSortOrder, setEditingPhaseDefSortOrder] = useState(1);
  const [editingPhaseOpenTime, setEditingPhaseOpenTime] = useState('');
  const [editingPhaseCloseTime, setEditingPhaseCloseTime] = useState('');
  const [editingPhaseSubmissionLimit, setEditingPhaseSubmissionLimit] = useState<string>('');
  const [editingPhaseLeaderboardMode, setEditingPhaseLeaderboardMode] = useState<'best' | 'latest'>('best');
  const [editingPhaseDisplayScores, setEditingPhaseDisplayScores] = useState(true);
  const [editingPhaseJudgeKey, setEditingPhaseJudgeKey] = useState('judge.py');
  const [globalSaveLoading, setGlobalSaveLoading] = useState(false);

  // Queries
  const { data: contest, isLoading: loadingContest } = useQuery<Contest>({
    queryKey: ['contest', contestId],
    queryFn: () => api.getContest(contestId!),
    enabled: !!contestId,
  });

  // Sync settings state
  useEffect(() => {
    if (contest) {
      setSettingsTitle(contest.title);
      setSettingsDesc(contest.description || '');
      if (contest.start_time) {
        try {
          setSettingsStartTime(new Date(contest.start_time).toISOString().slice(0, 16));
        } catch (e) {
          setSettingsStartTime('');
        }
      }
      if (contest.end_time) {
        try {
          setSettingsEndTime(new Date(contest.end_time).toISOString().slice(0, 16));
        } catch (e) {
          setSettingsEndTime('');
        }
      }
      setSettingsEntryPolicy(contest.entry_policy);
      setSettingsVisibility(contest.visibility);
      setSettingsRequireApproval(contest.require_approval);
      setSettingsScaleScores(contest.scale_scores || false);
    }
  }, [contest]);

  const { data: tasks = [], refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ['tasks', contestId],
    queryFn: () => api.getTasks(contestId!),
    enabled: !!contestId,
  });

  const { data: users = [], refetch: refetchUsers } = useQuery<User[]>({
    queryKey: ['adminUsers'],
    queryFn: api.listUsers,
    enabled: subTab === 'users',
  });

  const { data: announcements = [], refetch: refetchAnnouncements } = useQuery<any[]>({
    queryKey: ['adminAnnouncements', contestId],
    queryFn: () => api.getAnnouncements(contestId!),
    enabled: !!contestId && subTab === 'announcements',
  });

  const { data: tickets = [], refetch: refetchTickets } = useQuery<any[]>({
    queryKey: ['adminTickets', ticketFilterStatus],
    queryFn: () => api.listAllTickets(ticketFilterStatus ? { status: ticketFilterStatus } : undefined),
    enabled: subTab === 'tickets',
  });

  // Load evaluation sets mapping for checklist
  const { data: taskEvalSets = {} } = useQuery<{ [taskId: string]: any[] }>({
    queryKey: ['taskEvalSets', contestId, tasks.length],
    queryFn: async () => {
      const mapping: { [taskId: string]: any[] } = {};
      for (const t of tasks) {
        try {
          const sets = await api.getEvaluationSets(t.id);
          mapping[t.id] = sets;
        } catch (e) {
          mapping[t.id] = [];
        }
      }
      return mapping;
    },
    enabled: tasks.length > 0,
  });

  // Load phase definitions & concrete phases
  const { data: phaseDefs = [] } = useQuery<PhaseDef[]>({
    queryKey: ['phaseDefs', contestId],
    queryFn: () => api.getPhaseDefs(contestId!),
    enabled: !!contestId && (subTab === 'phases' || subTab === 'checklist'),
  });

  const { data: taskPhasesMap = {} } = useQuery<{ [taskId: string]: Phase[] }>({
    queryKey: ['taskPhases', contestId, tasks.length],
    queryFn: async () => {
      const mapping: { [taskId: string]: Phase[] } = {};
      for (const t of tasks) {
        try {
          const list = await api.getPhasesByTask(t.id);
          mapping[t.id] = list;
        } catch (e) {
          mapping[t.id] = [];
        }
      }
      return mapping;
    },
    enabled: tasks.length > 0 && subTab === 'phases',
  });

  // Mutations
  const createTaskMutation = useMutation({
    mutationFn: (payload: any) => api.createTask(contestId!, payload),
    onSuccess: () => {
      setTaskTitle('');
      setTaskSlug('');
      setTaskDesc('');
      setTaskScoreLabel('Accuracy');
      setTaskHigherBetter(true);
      setTaskSortOrder(tasks.length + 1);
      setTaskError(null);
      refetchTasks();
    },
    onError: (err: any) => {
      setTaskError(err?.response?.data?.message || 'Failed to create task.');
    }
  });

  const createEvaluationSetMutation = useMutation({
    mutationFn: ({ taskId, payload }: { taskId: string, payload: any }) => api.createEvaluationSet(taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskEvalSets', contestId] });
    }
  });

  const publishContestMutation = useMutation({
    mutationFn: () => api.publishContest(contestId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contest', contestId] });
    }
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string, role: string }) => api.updateUserRole(id, role),
    onSuccess: () => {
      refetchUsers();
    }
  });

  const { data: contestEntries = [], refetch: refetchContestEntries } = useQuery<ContestEntry[]>({
    queryKey: ['adminEntries', contestId],
    queryFn: () => api.getEntries(contestId!),
    enabled: !!contestId && subTab === 'entries',
  });

  const approveEntryMutation = useMutation({
    mutationFn: (id: string) => api.approveEntry(id),
    onSuccess: () => {
      refetchContestEntries();
    }
  });

  const disqualifyEntryMutation = useMutation({
    mutationFn: (id: string) => api.disqualifyEntry(id),
    onSuccess: () => {
      refetchContestEntries();
    }
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: (payload: any) => api.createAnnouncement(contestId!, payload),
    onSuccess: () => {
      setAnnTitle('');
      setAnnContent('');
      setAnnIsPinned(false);
      setAnnError(null);
      setAnnSuccess('Announcement created successfully!');
      refetchAnnouncements();
      setTimeout(() => setAnnSuccess(null), 3000);
    },
    onError: (err: any) => {
      setAnnError(err?.response?.data?.message || 'Failed to create announcement.');
    }
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string, payload: any }) => api.updateAnnouncement(id, payload),
    onSuccess: () => {
      setEditingAnnId(null);
      setAnnTitle('');
      setAnnContent('');
      setAnnIsPinned(false);
      setAnnError(null);
      setAnnSuccess('Announcement updated successfully!');
      refetchAnnouncements();
      setTimeout(() => setAnnSuccess(null), 3000);
    },
    onError: (err: any) => {
      setAnnError(err?.response?.data?.message || 'Failed to update announcement.');
    }
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: (id: string) => api.deleteAnnouncement(id),
    onSuccess: () => {
      refetchAnnouncements();
    }
  });

  const updateTicketMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string, payload: any }) => api.updateTicket(id, payload),
    onSuccess: () => {
      refetchTickets();
    }
  });

  const resolveTicketMutation = useMutation({
    mutationFn: (id: string) => api.resolveTicket(id),
    onSuccess: () => {
      refetchTickets();
    }
  });

  const updateContestMutation = useMutation({
    mutationFn: (payload: any) => api.updateContest(contestId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contest', contestId] });
      setSettingsSuccess('Contest settings updated successfully!');
      setSettingsError(null);
      setTimeout(() => setSettingsSuccess(null), 3000);
    },
    onError: (err: any) => {
      setSettingsError(err?.response?.data?.message || 'Failed to update contest settings.');
      setSettingsSuccess(null);
    }
  });

  const deleteContestMutation = useMutation({
    mutationFn: () => api.deleteContest(contestId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      alert('Contest deleted successfully.');
      navigate('/');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'Failed to delete contest.');
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      refetchTasks();
      queryClient.invalidateQueries({ queryKey: ['taskEvalSets', contestId] });
      alert('Task deleted successfully.');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'Failed to delete task.');
    }
  });


  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    setTaskError(null);
    if (!taskTitle || !taskSlug) {
      setTaskError('Title and Slug are required.');
      return;
    }
    createTaskMutation.mutate({
      title: taskTitle,
      slug: taskSlug,
      description: taskDesc,
      score_label: taskScoreLabel,
      higher_is_better: taskHigherBetter,
      sort_order: taskSortOrder,
    });
  };

  const formatDateForInput = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    } catch (e) {
      return '';
    }
  };

  const getRepresentativePhase = (defId: string) => {
    if (tasks.length === 0) return null;
    const firstTaskId = tasks[0].id;
    const phases = taskPhasesMap[firstTaskId] || [];
    return phases.find(p => p.contest_phase_def_id === defId) || null;
  };

  const handleSaveGlobalPhase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPhaseDefIdRef) return;

    const def = phaseDefs.find(d => d.id === editingPhaseDefIdRef);
    if (!def) return;

    setGlobalSaveLoading(true);

    try {
      // 1. Update Phase Definition Title and Sort Order
      await api.updatePhaseDef(contestId!, def.id, {
        title: editingPhaseDefTitle,
        sort_order: editingPhaseDefSortOrder,
      });

      // 2. Update or Create concrete phases for all tasks
      let count = 0;
      if (tasks.length > 0) {
        for (const t of tasks) {
          let sets = taskEvalSets[t.id];
          if (!sets || sets.length === 0) {
            const newSet = await api.createEvaluationSet(t.id, {
              key: 'public',
              title: `${t.title} Evaluation Set`
            });
            sets = [newSet];
            taskEvalSets[t.id] = sets;
          }
          const evalSetId = sets[0].id;

          const phasesList = await api.getPhasesByTask(t.id);
          const existingPhase = phasesList.find(p => p.contest_phase_def_id === def.id);

          const openTimeISO = editingPhaseOpenTime ? new Date(editingPhaseOpenTime).toISOString() : '';
          const closeTimeISO = editingPhaseCloseTime ? new Date(editingPhaseCloseTime).toISOString() : '';

          if (openTimeISO && closeTimeISO) {
            const payload = {
              contest_phase_def_id: def.id,
              evaluation_set_id: evalSetId,
              slug: existingPhase?.slug || `${t.slug}-${def.key}-${Date.now().toString().slice(-4)}`,
              title: existingPhase?.title || `${t.title} - ${editingPhaseDefTitle}`,
              description: existingPhase?.description || `Phase ${editingPhaseDefTitle} for task ${t.title}`,
              open_time: openTimeISO,
              close_time: closeTimeISO,
              judge_key: editingPhaseJudgeKey || 'judge.py',
              submission_limit: editingPhaseSubmissionLimit ? parseInt(editingPhaseSubmissionLimit, 10) : null,
              leaderboard_mode: editingPhaseLeaderboardMode,
              allow_official_submit: true,
              allow_virtual_submit: true,
              allow_practice_submit: true,
              display_scores: editingPhaseDisplayScores,
              is_final: def.key.includes('final'),
              sort_order: editingPhaseDefSortOrder,
            };

            if (existingPhase) {
              await api.updatePhase(existingPhase.id, {
                title: payload.title,
                open_time: payload.open_time,
                close_time: payload.close_time,
                judge_key: payload.judge_key,
                submission_limit: payload.submission_limit,
                display_scores: payload.display_scores,
                leaderboard_mode: payload.leaderboard_mode,
              });
            } else {
              await api.createPhase(t.id, payload);
            }
            count++;
          }
        }
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['phaseDefs', contestId] });
      queryClient.invalidateQueries({ queryKey: ['taskPhases', contestId] });
      queryClient.invalidateQueries({ queryKey: ['taskEvalSets', contestId] });

      // Reset editing state
      setEditingPhaseDefIdRef(null);
      setEditingPhaseDefTitle('');
      setEditingPhaseOpenTime('');
      setEditingPhaseCloseTime('');
      setEditingPhaseSubmissionLimit('');
      setEditingPhaseLeaderboardMode('best');
      setEditingPhaseDisplayScores(true);
      setEditingPhaseJudgeKey('judge.py');

      alert(`Successfully saved phase configuration and synchronized ${count} tasks.`);
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || 'Failed to save configuration.');
    } finally {
      setGlobalSaveLoading(false);
    }
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>, setId: string, filename: string) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setUploadError(null);
    setUploadProgress('initiating');

    try {
      // 1. Initiate upload
      const initRes = await api.initiateAssets(setId, {
        assets: [{
          asset_key: filename,
          filename: filename,
          content_type: file.type || 'text/plain',
          size_bytes: file.size,
        }]
      });

      const uploadInfo = initRes.uploads[0];
      setUploadProgress('uploading');

      // 2. Put file to S3
      await axios.put(uploadInfo.put_url, file, {
        headers: {
          'Content-Type': file.type || 'text/plain',
        }
      });

      setUploadProgress('completing');

      // 3. Complete
      await api.completeAssets(setId, {
        assets: [{
          asset_key: filename,
          filename: filename,
          object_key: uploadInfo.object_key,
          size_bytes: file.size,
          content_type: file.type || 'text/plain',
        }]
      });

      setUploadProgress('done');
      queryClient.invalidateQueries({ queryKey: ['taskEvalSets', contestId] });
      setTimeout(() => setUploadProgress('idle'), 1500);
    } catch (err: any) {
      console.error(err);
      setUploadProgress('failed');
      setUploadError(err?.response?.data?.message || err?.message || 'Asset upload failed.');
    }
  };

  // Checklist computation
  const checklist = {
    hasTasks: tasks.length > 0,
    hasEvalSets: tasks.length > 0 && tasks.every(t => (taskEvalSets[t.id]?.length || 0) > 0),
    hasJuryAssets: tasks.length > 0 && tasks.every(t => {
      const sets = taskEvalSets[t.id] || [];
      return sets.some(s => s.has_judge_script && s.has_ground_truth && s.has_inputs);
    }),
    isReady: false
  };
  checklist.isReady = checklist.hasTasks && checklist.hasEvalSets && checklist.hasJuryAssets;

  if (loadingContest) {
    return (
      <div className="container flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
        <div className="spinner"></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      {/* Admin header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to={`/contests/${contestId}`} className="btn btn-secondary flex items-center gap-2" style={{ width: 'fit-content', padding: '0.4rem 0.8rem', marginBottom: '1rem' }}>
          <ArrowLeft size={14} /> Back to Contest
        </Link>
        <div className="flex justify-between items-center">
          <div>
            <h1 style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings /> Admin Setup: {contest?.title}
            </h1>
            <p className="text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
              Validate system assets, upload evaluation parameters, and publish target contest.
            </p>
          </div>
        </div>
      </div>

      {/* Sub tabs navigation */}
      <div className="tab-bar">
        <div className={`tab-item ${subTab === 'checklist' ? 'active' : ''}`} onClick={() => setSubTab('checklist')}>
          Asset Checklist & Publish
        </div>
        <div className={`tab-item ${subTab === 'tasks' ? 'active' : ''}`} onClick={() => setSubTab('tasks')}>
          Manage Challenge Tasks
        </div>
        <div className={`tab-item ${subTab === 'entries' ? 'active' : ''}`} onClick={() => setSubTab('entries')}>
          Contest Registrations
        </div>
        <div className={`tab-item ${subTab === 'announcements' ? 'active' : ''}`} onClick={() => setSubTab('announcements')}>
          Manage Announcements
        </div>
        <div className={`tab-item ${subTab === 'tickets' ? 'active' : ''}`} onClick={() => setSubTab('tickets')}>
          Support Tickets
        </div>
        <div className={`tab-item ${subTab === 'phases' ? 'active' : ''}`} onClick={() => setSubTab('phases')}>
          Manage Phases
        </div>
        <div className={`tab-item ${subTab === 'settings' ? 'active' : ''}`} onClick={() => setSubTab('settings')}>
          Contest Settings
        </div>
        <div className={`tab-item ${subTab === 'users' ? 'active' : ''}`} onClick={() => setSubTab('users')}>
          User Role Manager
        </div>
      </div>

      {/* Checklist & Publish Tab */}
      {subTab === 'checklist' && (
        <div className="grid-3-1" style={{ gridTemplateColumns: '2fr 1fr' }}>
          {/* Checklist items */}
          <div className="panel">
            <h3 style={{ marginBottom: '1.5rem' }}>Contest Readiness Checklist</h3>

            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center" style={{ padding: '0.75rem', borderBottom: '1px solid hsl(var(--border))' }}>
                <div className="flex items-center gap-3">
                  {checklist.hasTasks ? (
                    <CheckCircle2 className="text-success" style={{ color: 'hsl(var(--success))' }} />
                  ) : (
                    <XCircle className="text-danger" style={{ color: 'hsl(var(--danger))' }} />
                  )}
                  <div>
                    <strong>Task Configuration</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>At least 1 programming/prediction task created.</div>
                  </div>
                </div>
                <span className="font-mono">{tasks.length} tasks</span>
              </div>

              <div className="flex justify-between items-center" style={{ padding: '0.75rem', borderBottom: '1px solid hsl(var(--border))' }}>
                <div className="flex items-center gap-3">
                  {checklist.hasEvalSets ? (
                    <CheckCircle2 className="text-success" style={{ color: 'hsl(var(--success))' }} />
                  ) : (
                    <XCircle className="text-danger" style={{ color: 'hsl(var(--danger))' }} />
                  )}
                  <div>
                    <strong>Evaluation Sets Defined</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Each task must possess an active evaluation config target.</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center" style={{ padding: '0.75rem', borderBottom: '1px solid hsl(var(--border))' }}>
                <div className="flex items-center gap-3">
                  {checklist.hasJuryAssets ? (
                    <CheckCircle2 className="text-success" style={{ color: 'hsl(var(--success))' }} />
                  ) : (
                    <XCircle className="text-danger" style={{ color: 'hsl(var(--danger))' }} />
                  )}
                  <div>
                    <strong>Jury Assets Uploaded</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Required scripts: `judge.py`, `ground_truth.csv`, and `inputs.csv` must be present.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Publish gate panel */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Publish Contest Gate</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Publishing locks editing of parameters and initiates registration queues.
              </p>
              <div style={{ margin: '1rem 0' }}>
                <strong>Current Status:</strong>{' '}
                <span className={`badge ${contest?.status === 'running' ? 'badge-success' : 'badge-warning'}`}>
                  {contest?.status}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 'auto' }}>
              {contest?.status === 'draft' ? (
                <button
                  onClick={() => publishContestMutation.mutate()}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={!checklist.isReady || publishContestMutation.isPending}
                >
                  {publishContestMutation.isPending ? 'Publishing...' : 'Publish Contest'}
                </button>
              ) : (
                <button className="btn btn-secondary" style={{ width: '100%' }} disabled>
                  Already Published
                </button>
              )}
              {!checklist.isReady && contest?.status === 'draft' && (
                <p style={{ fontSize: '0.75rem', color: 'hsl(var(--danger))', marginTop: '0.5rem', textAlign: 'center' }}>
                  Please complete the readiness checklist to enable the publish gate.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manage Tasks Tab */}
      {subTab === 'tasks' && (
        <div className="grid-3-1" style={{ gridTemplateColumns: '1fr 2fr' }}>
          {/* Create Task Form */}
          <div className="panel">
            <h3 style={{ marginBottom: '1.25rem' }}>Create Task</h3>
            {taskError && (
              <div className="alert alert-danger" style={{ fontSize: '0.8rem' }}>{taskError}</div>
            )}
            <form onSubmit={handleCreateTask}>
              <div className="form-group">
                <label className="form-label">Task Title *</label>
                <input
                  type="text"
                  className="form-input"
                  value={taskTitle}
                  onChange={(e) => {
                    setTaskTitle(e.target.value);
                    setTaskSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                  }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Slug *</label>
                <input
                  type="text"
                  className="form-input"
                  value={taskSlug}
                  onChange={(e) => setTaskSlug(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  style={{ height: '70px', resize: 'vertical' }}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Score Metrics Label</label>
                <input
                  type="text"
                  className="form-input"
                  value={taskScoreLabel}
                  onChange={(e) => setTaskScoreLabel(e.target.value)}
                  placeholder="e.g. Accuracy / F1"
                />
              </div>

              <div className="form-group flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={taskHigherBetter}
                  onChange={(e) => setTaskHigherBetter(e.target.checked)}
                  id="higher_is_better"
                />
                <label htmlFor="higher_is_better" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Higher score is better</label>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={createTaskMutation.isPending}
              >
                {createTaskMutation.isPending ? 'Saving...' : 'Add Task'}
              </button>
            </form>
          </div>

          {/* Task Assets management */}
          <div className="flex flex-col gap-4">
            {tasks.length === 0 ? (
              <div className="panel text-center text-muted" style={{ padding: '2rem' }}>
                No tasks created yet.
              </div>
            ) : (
              tasks.map(t => {
                const sets = taskEvalSets[t.id] || [];

                return (
                  <div key={t.id} className="panel">
                    <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: 0 }}>{t.title}</h4>
                        <span className="font-mono text-muted" style={{ fontSize: '0.8rem' }}>slug: {t.slug}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete the task "${t.title}"? This will delete all evaluation sets and contestant submissions associated with this task.`)) {
                            deleteTaskMutation.mutate(t.id);
                          }
                        }}
                        className="btn btn-danger flex items-center gap-1"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid hsl(var(--danger-border))' }}
                        disabled={deleteTaskMutation.isPending}
                      >
                        <Trash2 size={12} /> Delete Task
                      </button>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <strong>Evaluation Configuration:</strong>
                      {sets.length === 0 ? (
                        <div style={{ marginTop: '0.5rem' }}>
                          <button
                            onClick={() => createEvaluationSetMutation.mutate({
                              taskId: t.id,
                              payload: {
                                key: 'public',
                                title: `${t.title} Evaluation Set`
                              }
                            })}
                            className="btn btn-secondary flex items-center gap-1"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            disabled={createEvaluationSetMutation.isPending}
                          >
                            <Plus size={12} /> Initialize Evaluation Set
                          </button>
                        </div>
                      ) : (
                        <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {sets.map((s) => (
                            <div key={s.id} style={{ border: '1px solid hsl(var(--border))', padding: '1rem', borderRadius: 'var(--radius)', backgroundColor: 'var(--background-panel-sub || hsla(0, 0%, 50%, 0.02))' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.5rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize', color: 'hsl(var(--primary))' }}>
                                  Type: {s.key} Set — {s.title}
                                </span>
                                <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                                  ID: {s.id}
                                </span>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                {/* Upload judge.py */}
                                <div style={{ border: '1px solid hsl(var(--border))', padding: '0.75rem', borderRadius: 'var(--radius)' }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                                    judge.py{' '}
                                    {s.has_judge_script ? (
                                      <span className="text-success" style={{ color: 'hsl(var(--success))' }}>✓ Present</span>
                                    ) : (
                                      <span className="text-danger" style={{ color: 'hsl(var(--danger))' }}>✗ Missing</span>
                                    )}
                                  </div>
                                  <input
                                    type="file"
                                    id={`judge-upload-${s.id}`}
                                    style={{ display: 'none' }}
                                    onChange={(e) => handleAssetUpload(e, s.id, 'judge.py')}
                                  />
                                  <button
                                    onClick={() => document.getElementById(`judge-upload-${s.id}`)?.click()}
                                    className="btn btn-secondary flex items-center gap-1"
                                    style={{ width: '100%', padding: '0.3rem', fontSize: '0.75rem' }}
                                    disabled={uploadProgress !== 'idle'}
                                  >
                                    <Upload size={12} /> Upload Python Evaluator
                                  </button>
                                </div>

                                {/* Upload ground_truth.csv */}
                                <div style={{ border: '1px solid hsl(var(--border))', padding: '0.75rem', borderRadius: 'var(--radius)' }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                                    ground_truth.csv{' '}
                                    {s.has_ground_truth ? (
                                      <span className="text-success" style={{ color: 'hsl(var(--success))' }}>✓ Present</span>
                                    ) : (
                                      <span className="text-danger" style={{ color: 'hsl(var(--danger))' }}>✗ Missing</span>
                                    )}
                                  </div>
                                  <input
                                    type="file"
                                    id={`gt-upload-${s.id}`}
                                    style={{ display: 'none' }}
                                    onChange={(e) => handleAssetUpload(e, s.id, 'ground_truth.csv')}
                                  />
                                  <button
                                    onClick={() => document.getElementById(`gt-upload-${s.id}`)?.click()}
                                    className="btn btn-secondary flex items-center gap-1"
                                    style={{ width: '100%', padding: '0.3rem', fontSize: '0.75rem' }}
                                    disabled={uploadProgress !== 'idle'}
                                  >
                                    <Upload size={12} /> Upload Target Answers
                                  </button>
                                </div>

                                {/* Upload inputs.csv */}
                                <div style={{ border: '1px solid hsl(var(--border))', padding: '0.75rem', borderRadius: 'var(--radius)' }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                                    inputs.csv{' '}
                                    {s.has_inputs ? (
                                      <span className="text-success" style={{ color: 'hsl(var(--success))' }}>✓ Present</span>
                                    ) : (
                                      <span className="text-danger" style={{ color: 'hsl(var(--danger))' }}>✗ Missing</span>
                                    )}
                                  </div>
                                  <input
                                    type="file"
                                    id={`inputs-upload-${s.id}`}
                                    style={{ display: 'none' }}
                                    onChange={(e) => handleAssetUpload(e, s.id, 'inputs.csv')}
                                  />
                                  <button
                                    onClick={() => document.getElementById(`inputs-upload-${s.id}`)?.click()}
                                    className="btn btn-secondary flex items-center gap-1"
                                    style={{ width: '100%', padding: '0.3rem', fontSize: '0.75rem' }}
                                    disabled={uploadProgress !== 'idle'}
                                  >
                                    <Upload size={12} /> Upload Input Data
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}

                          {uploadError && (
                            <div className="alert alert-danger" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', marginBottom: 0 }}>
                              {uploadError}
                            </div>
                          )}

                          {uploadProgress !== 'idle' && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
                              Uploading assets status: <strong>{uploadProgress}</strong>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Contest Entries Management Tab */}
      {subTab === 'entries' && (
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-header" style={{ padding: '1rem 1.5rem', marginBottom: 0 }}>
            <h3 style={{ margin: 0 }}>Contest Registrations</h3>
          </div>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, marginBottom: 0 }}>
            {contestEntries.length === 0 ? (
              <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No registrations for this contest yet.</p>
            ) : (
              <table className="oj-table">
                <thead>
                  <tr>
                    <th>Display Name</th>
                    <th>Type</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th style={{ width: '220px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contestEntries.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>{e.display_name}</td>
                      <td>
                        <span className="badge badge-secondary" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                          {e.entry_type}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                          {e.entry_mode}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${e.status === 'approved' || e.status === 'active' ? 'badge-success' : e.status === 'disqualified' ? 'badge-danger' : 'badge-warning'}`}>
                          {e.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                          {(e.status === 'pending' || e.status === 'disqualified') && (
                            <button
                              onClick={() => approveEntryMutation.mutate(e.id)}
                              className="btn btn-primary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              disabled={approveEntryMutation.isPending}
                            >
                              Approve
                            </button>
                          )}
                          {(e.status === 'pending' || e.status === 'approved' || e.status === 'active') && (
                            <button
                              onClick={() => disqualifyEntryMutation.mutate(e.id)}
                              className="btn btn-danger"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              disabled={disqualifyEntryMutation.isPending}
                            >
                              Disqualify
                            </button>
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

      {/* Contest Settings Tab */}
      {subTab === 'settings' && (
        <>
          <div className="panel" style={{ maxWidth: '600px' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Edit Contest Details</h3>

            {settingsError && (
              <div className="alert alert-danger" style={{ fontSize: '0.9rem' }}>
                {settingsError}
              </div>
            )}

            {settingsSuccess && (
              <div className="alert alert-success" style={{ fontSize: '0.9rem' }}>
                {settingsSuccess}
              </div>
            )}

            <form onSubmit={(e) => {
              e.preventDefault();
              setSettingsError(null);
              setSettingsSuccess(null);
              updateContestMutation.mutate({
                title: settingsTitle,
                description: settingsDesc,
                start_time: new Date(settingsStartTime).toISOString(),
                end_time: new Date(settingsEndTime).toISOString(),
                entry_policy: settingsEntryPolicy,
                visibility: settingsVisibility,
                require_approval: settingsRequireApproval,
                scale_scores: settingsScaleScores,
                max_team_size: settingsEntryPolicy === 'team' || settingsEntryPolicy === 'both' ? 3 : 1
              });
            }}>
              <div className="form-group">
                <label className="form-label">Contest Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={settingsTitle}
                  onChange={(e) => setSettingsTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: '100px' }}
                  value={settingsDesc}
                  onChange={(e) => setSettingsDesc(e.target.value)}
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Start Time</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={settingsStartTime}
                    onChange={(e) => setSettingsStartTime(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">End Time</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={settingsEndTime}
                    onChange={(e) => setSettingsEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Entry Policy</label>
                  <select
                    className="form-input"
                    value={settingsEntryPolicy}
                    onChange={(e) => setSettingsEntryPolicy(e.target.value as any)}
                  >
                    <option value="individual">Individual Only</option>
                    <option value="team">Team Only</option>
                    <option value="both">Both Individual & Team</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Visibility</label>
                  <select
                    className="form-input"
                    value={settingsVisibility}
                    onChange={(e) => setSettingsVisibility(e.target.value as any)}
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settingsRequireApproval}
                    onChange={(e) => setSettingsRequireApproval(e.target.checked)}
                  />
                  Require Admin/Jury Approval for Contest Registrations
                </label>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settingsScaleScores}
                    onChange={(e) => setSettingsScaleScores(e.target.checked)}
                  />
                  Scale Scores (Normalize task scores so max score = 100)
                </label>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
                disabled={updateContestMutation.isPending}
              >
                {updateContestMutation.isPending ? 'Saving changes...' : 'Save Settings'}
              </button>
            </form>
          </div>

          <div className="panel" style={{ maxWidth: '600px', marginTop: '2rem', border: '1px solid hsl(var(--danger-border))', backgroundColor: 'hsl(var(--danger-bg))' }}>
            <h3 style={{ color: 'hsl(var(--danger))', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
              <AlertTriangle size={20} /> Danger Zone
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'hsl(var(--text-muted))', marginBottom: '1.5rem' }}>
              Once you delete a contest, all associated phases, tasks, submissions, entries, and support tickets will be permanently removed. This action cannot be undone.
            </p>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm('ARE YOU ABSOLUTELY SURE? All data for this contest will be permanently destroyed. Type "DELETE" to confirm.')) {
                  const input = window.prompt(`Please type the contest slug "${contest?.slug}" to confirm deletion:`);
                  if (input === contest?.slug) {
                    deleteContestMutation.mutate();
                  } else if (input !== null) {
                    alert('Slug did not match. Deletion aborted.');
                  }
                }
              }}
              disabled={deleteContestMutation.isPending}
            >
              {deleteContestMutation.isPending ? 'Deleting contest...' : 'Delete Contest'}
            </button>
          </div>
        </>
      )}

      {/* User Manager Tab */}
      {subTab === 'users' && (
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-header" style={{ padding: '1rem 1.5rem', marginBottom: 0 }}>
            <h3 style={{ margin: 0 }}>System Accounts & Roles</h3>
          </div>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, marginBottom: 0 }}>
            <table className="oj-table">
              <thead>
                <tr>
                  <th>User Full Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th style={{ width: '220px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                    <td className="font-mono" style={{ fontSize: '0.85rem' }}>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'jury' ? 'badge-warning' : 'badge-success'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => updateUserRoleMutation.mutate({ id: u.id, role: 'admin' })}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            disabled={updateUserRoleMutation.isPending}
                          >
                            Set Admin
                          </button>
                        )}
                        {u.role !== 'jury' && (
                          <button
                            onClick={() => updateUserRoleMutation.mutate({ id: u.id, role: 'jury' })}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            disabled={updateUserRoleMutation.isPending}
                          >
                            Set Jury
                          </button>
                        )}
                        {u.role !== 'contestant' && (
                          <button
                            onClick={() => updateUserRoleMutation.mutate({ id: u.id, role: 'contestant' })}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            disabled={updateUserRoleMutation.isPending}
                          >
                            Set Contestant
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manage Announcements Tab */}
      {subTab === 'announcements' && (
        <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
          {/* Announcements list */}
          <div className="panel">
            <h3 style={{ marginBottom: '1.25rem' }}>Current Contest Announcements</h3>
            <div className="flex flex-col gap-3">
              {announcements.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No announcements created yet.</p>
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
                        padding: '1rem',
                        borderRadius: 'var(--radius)',
                        border: ann.is_pinned ? '1px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
                        backgroundColor: ann.is_pinned ? 'hsla(var(--primary), 0.02)' : '#fdfdfd'
                      }}
                    >
                      <div className="flex justify-between items-start" style={{ marginBottom: '0.5rem' }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            {ann.is_pinned && <span className="badge badge-primary" style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem' }}>PINNED</span>}
                            {ann.title}
                          </span>
                          <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                            ID: {ann.id} | Created: {new Date(ann.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingAnnId(ann.id);
                              setAnnTitle(ann.title);
                              setAnnContent(ann.content);
                              setAnnIsPinned(ann.is_pinned);
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('Delete this announcement?')) {
                                deleteAnnouncementMutation.mutate(ann.id);
                              }
                            }}
                            className="btn btn-danger"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.85rem', margin: 0, whiteSpace: 'pre-line', color: 'var(--text)' }}>
                        {ann.content}
                      </p>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Form Create/Edit */}
          <div className="panel">
            <h3>{editingAnnId ? 'Edit Announcement' : 'Create Announcement'}</h3>
            {annError && <div className="alert alert-danger" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>{annError}</div>}
            {annSuccess && <div className="alert alert-success" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>{annSuccess}</div>}

            <form onSubmit={(e) => {
              e.preventDefault();
              setAnnError(null);
              setAnnSuccess(null);
              if (!annTitle.trim() || !annContent.trim()) {
                setAnnError('Title and Content are required.');
                return;
              }
              if (editingAnnId) {
                updateAnnouncementMutation.mutate({
                  id: editingAnnId,
                  payload: { title: annTitle, content: annContent, is_pinned: annIsPinned }
                });
              } else {
                createAnnouncementMutation.mutate({
                  title: annTitle,
                  content: annContent,
                  is_pinned: annIsPinned
                });
              }
            }}>
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input
                  type="text"
                  className="form-input"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="Announcement Subject..."
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Content *</label>
                <textarea
                  className="form-input"
                  value={annContent}
                  onChange={(e) => setAnnContent(e.target.value)}
                  placeholder="Write announcement body markdown or plain text here..."
                  required
                  style={{ height: '150px', resize: 'vertical' }}
                />
              </div>

              <div className="form-group flex items-center gap-2" style={{ marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={annIsPinned}
                  onChange={(e) => setAnnIsPinned(e.target.checked)}
                  id="ann_is_pinned"
                />
                <label htmlFor="ann_is_pinned" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Pin Announcement to top</label>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={createAnnouncementMutation.isPending || updateAnnouncementMutation.isPending}
                >
                  {editingAnnId ? 'Update' : 'Post Announcement'}
                </button>
                {editingAnnId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAnnId(null);
                      setAnnTitle('');
                      setAnnContent('');
                      setAnnIsPinned(false);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Support Tickets Dashboard Tab */}
      {subTab === 'tickets' && (
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-header" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
            <h3 style={{ margin: 0 }}>Support Tickets Dispatcher</h3>
            
            {/* Filter by status */}
            <div className="flex items-center gap-2">
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Status Filter:</label>
              <select
                className="form-input"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', width: '150px' }}
                value={ticketFilterStatus}
                onChange={(e) => setTicketFilterStatus(e.target.value)}
              >
                <option value="">All Tickets</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="table-container" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, marginBottom: 0 }}>
            {tickets.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No support tickets found matching the selection.
              </div>
            ) : (
              <table className="oj-table">
                <thead>
                  <tr>
                    <th>Created At</th>
                    <th>Category & Priority</th>
                    <th>Participant Entry ID</th>
                    <th>Subject & Description</th>
                    <th>Linked Submission</th>
                    <th>Status</th>
                    <th>Actions / Assignment</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(ticket => (
                    <tr key={ticket.id} style={{ verticalAlign: 'top' }}>
                      <td className="font-mono" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {new Date(ticket.created_at).toLocaleString()}
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: '0.65rem', width: 'fit-content' }}>
                            {ticket.category}
                          </span>
                          
                          {/* Priority dropdown */}
                          <select
                            className="form-input"
                            style={{ padding: '0.1rem 0.25rem', fontSize: '0.7rem', height: 'auto', width: '90px' }}
                            value={ticket.priority}
                            onChange={(e) => updateTicketMutation.mutate({
                              id: ticket.id,
                              payload: { priority: e.target.value }
                            })}
                            disabled={updateTicketMutation.isPending}
                          >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </div>
                      </td>
                      <td className="font-mono" style={{ fontSize: '0.75rem', wordBreak: 'break-all', maxWidth: '120px' }}>
                        {ticket.contest_entry_id}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{ticket.subject}</div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text)', whiteSpace: 'pre-line', margin: 0, maxWidth: '300px' }}>
                          {ticket.description}
                        </p>
                      </td>
                      <td className="font-mono" style={{ fontSize: '0.75rem' }}>
                        {ticket.submission_id ? (
                          <code style={{ fontSize: '0.7rem' }}>{ticket.submission_id}</code>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <span className={`badge ${
                            ticket.status === 'resolved' ? 'badge-success' : ticket.status === 'rejected' ? 'badge-danger' : ticket.status === 'in_progress' ? 'badge-info' : 'badge-warning'
                          }`} style={{ fontSize: '0.65rem', textTransform: 'uppercase', width: 'fit-content' }}>
                            {ticket.status.replace('_', ' ')}
                          </span>

                          {/* Status dropdown */}
                          <select
                            className="form-input"
                            style={{ padding: '0.1rem 0.25rem', fontSize: '0.7rem', height: 'auto', width: '110px' }}
                            value={ticket.status}
                            onChange={(e) => updateTicketMutation.mutate({
                              id: ticket.id,
                              payload: { status: e.target.value }
                            })}
                            disabled={updateTicketMutation.isPending}
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-2" style={{ minWidth: '150px' }}>
                          {/* Assignment input/selector or Assign to me */}
                          <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span className="text-muted">
                              {ticket.assigned_to ? `Assigned: ${ticket.assigned_to}` : 'Unassigned'}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => updateTicketMutation.mutate({
                                  id: ticket.id,
                                  payload: { assigned_to: 'Jury Staff' }
                                })}
                                className="btn btn-secondary"
                                style={{ padding: '0.15rem 0.3rem', fontSize: '0.7rem', flex: 1 }}
                                disabled={updateTicketMutation.isPending || ticket.assigned_to === 'Jury Staff'}
                              >
                                Claim
                              </button>
                              {ticket.assigned_to && (
                                <button
                                  onClick={() => updateTicketMutation.mutate({
                                    id: ticket.id,
                                    payload: { assigned_to: null }
                                  })}
                                  className="btn btn-secondary text-danger"
                                  style={{ padding: '0.15rem 0.3rem', fontSize: '0.7rem' }}
                                  disabled={updateTicketMutation.isPending}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>

                          {ticket.status !== 'resolved' && (
                            <button
                              onClick={() => resolveTicketMutation.mutate(ticket.id)}
                              className="btn btn-primary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: '100%' }}
                              disabled={resolveTicketMutation.isPending}
                            >
                              Mark Resolved
                            </button>
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

      {/* Manage Phases Tab */}
      {subTab === 'phases' && (
        <div className="flex flex-col gap-6">
          {/* Unified Contest Phases Management Panel */}
          <div className="panel">
            <h3 style={{ marginBottom: '0.5rem' }}>Contest Phases Management</h3>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Configure standard sub-contests (phases), timing schedules, and evaluator settings for all tasks in one place.
            </p>
            
            <div className="table-container">
              <table className="oj-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Title</th>
                    <th style={{ width: '80px' }}>Sort</th>
                    <th>Timing (Start to End)</th>
                    <th>Judge Script</th>
                    <th style={{ width: '80px' }}>Limit</th>
                    <th>Scoring</th>
                    <th style={{ width: '110px' }}>Show Scores</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {phaseDefs.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No phase definitions found. Click "Auto-Add Missing Predefined Phase" below to initialize.
                      </td>
                    </tr>
                  ) : (
                    phaseDefs.map(def => {
                      const repPhase = getRepresentativePhase(def.id);
                      const openTime = repPhase?.open_time;
                      const closeTime = repPhase?.close_time;
                      
                      let timingStr = '';
                      if (openTime && closeTime) {
                        try {
                          const openD = new Date(openTime);
                          const closeD = new Date(closeTime);
                          timingStr = `${openD.toLocaleDateString()} ${openD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${closeD.toLocaleDateString()} ${closeD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                        } catch (e) {
                          timingStr = 'Invalid Date';
                        }
                      }

                      return (
                        <tr key={def.id}>
                          <td className="font-mono" style={{ fontSize: '0.85rem' }}>{def.key}</td>
                          <td style={{ fontWeight: 600 }}>{def.title}</td>
                          <td>{def.sort_order}</td>
                          <td>
                            {openTime && closeTime ? (
                              <span className="badge badge-success" style={{ fontSize: '0.8rem' }}>{timingStr}</span>
                            ) : (
                              <span className="badge badge-warning" style={{ fontSize: '0.8rem' }}>Not Scheduled</span>
                            )}
                          </td>
                          <td className="font-mono" style={{ fontSize: '0.85rem' }}>{repPhase?.judge_key || '-'}</td>
                          <td>{repPhase?.submission_limit !== null && repPhase?.submission_limit !== undefined ? repPhase.submission_limit : 'Unlimited'}</td>
                          <td>
                            {repPhase?.leaderboard_mode ? (
                              repPhase.leaderboard_mode === 'best' ? 'Best score' : 'Latest score'
                            ) : (
                              '-'
                            )}
                          </td>
                          <td>{repPhase ? (repPhase.display_scores ? 'Yes' : 'No') : '-'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPhaseDefIdRef(def.id);
                                  setEditingPhaseDefTitle(def.title);
                                  setEditingPhaseDefSortOrder(def.sort_order);
                                  if (repPhase) {
                                    setEditingPhaseOpenTime(formatDateForInput(repPhase.open_time));
                                    setEditingPhaseCloseTime(formatDateForInput(repPhase.close_time));
                                    setEditingPhaseSubmissionLimit(repPhase.submission_limit?.toString() || '');
                                    setEditingPhaseLeaderboardMode(repPhase.leaderboard_mode || 'best');
                                    setEditingPhaseDisplayScores(repPhase.display_scores);
                                    setEditingPhaseJudgeKey(repPhase.judge_key || 'judge.py');
                                  } else {
                                    setEditingPhaseOpenTime('');
                                    setEditingPhaseCloseTime('');
                                    setEditingPhaseSubmissionLimit('');
                                    setEditingPhaseLeaderboardMode('best');
                                    setEditingPhaseDisplayScores(true);
                                    setEditingPhaseJudgeKey('judge.py');
                                  }
                                }}
                                className="btn btn-secondary"
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (window.confirm(`Are you sure you want to delete the phase definition "${def.title}"? This will delete all concrete task-phases and submissions belonging to this phase definition across all tasks.`)) {
                                    try {
                                      await api.deletePhaseDef(contestId!, def.id);
                                      queryClient.invalidateQueries({ queryKey: ['phaseDefs', contestId] });
                                    } catch (err: any) {
                                      alert(err?.response?.data?.message || 'Failed to delete phase definition.');
                                    }
                                  }
                                }}
                                className="btn btn-danger"
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <button
                type="button"
                onClick={async () => {
                  const availableKeys: ('public_test' | 'private_test' | 'final_public' | 'final_private')[] = ['public_test', 'private_test', 'final_public', 'final_private'];
                  const existingKeys = phaseDefs.map(d => d.key);
                  const missingKeys = availableKeys.filter(k => !existingKeys.includes(k));
                  if (missingKeys.length === 0) {
                    alert('All predefined phase types are already defined.');
                    return;
                  }
                  const keyToCreate = missingKeys[0];
                  const titleToCreate = keyToCreate.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                  try {
                    await api.createPhaseDef(contestId!, {
                      key: keyToCreate,
                      title: titleToCreate,
                      sort_order: phaseDefs.length + 1
                    });
                    queryClient.invalidateQueries({ queryKey: ['phaseDefs', contestId] });
                  } catch (err: any) {
                    alert(err?.response?.data?.message || 'Failed to add phase type.');
                  }
                }}
                className="btn btn-secondary flex items-center gap-1"
                style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
              >
                <Plus size={12} /> Auto-Add Missing Predefined Phase
              </button>
            </div>
          </div>

          {/* Edit Modal Overlay */}
          {editingPhaseDefIdRef && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}>
              <div className="panel" style={{
                width: '100%',
                maxWidth: '550px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1px solid hsl(var(--border-dark))',
                margin: 0
              }}>
                <div className="panel-header" style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                    Edit Phase Configuration
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPhaseDefIdRef(null);
                    }}
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    Close
                  </button>
                </div>

                <form onSubmit={handleSaveGlobalPhase}>
                  <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Phase Title *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editingPhaseDefTitle}
                        onChange={(e) => setEditingPhaseDefTitle(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Sort Order *</label>
                      <input
                        type="number"
                        className="form-input"
                        value={editingPhaseDefSortOrder}
                        onChange={(e) => setEditingPhaseDefSortOrder(parseInt(e.target.value, 10))}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Start Time *</label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        value={editingPhaseOpenTime}
                        onChange={(e) => setEditingPhaseOpenTime(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">End Time *</label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        value={editingPhaseCloseTime}
                        onChange={(e) => setEditingPhaseCloseTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Judge Script Key *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editingPhaseJudgeKey}
                        onChange={(e) => setEditingPhaseJudgeKey(e.target.value)}
                        placeholder="e.g. judge.py"
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Submission Limit</label>
                      <input
                        type="number"
                        className="form-input"
                        value={editingPhaseSubmissionLimit}
                        onChange={(e) => setEditingPhaseSubmissionLimit(e.target.value)}
                        placeholder="Leave blank for unlimited"
                      />
                    </div>
                  </div>

                  <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Leaderboard Scoring Mode</label>
                      <select
                        className="form-input"
                        value={editingPhaseLeaderboardMode}
                        onChange={(e) => setEditingPhaseLeaderboardMode(e.target.value as any)}
                      >
                        <option value="best">Best score</option>
                        <option value="latest">Latest score</option>
                      </select>
                    </div>

                    <div className="form-group flex items-center gap-2" style={{ marginBottom: 0, height: '100%', paddingTop: '1.25rem' }}>
                      <input
                        type="checkbox"
                        checked={editingPhaseDisplayScores}
                        onChange={(e) => setEditingPhaseDisplayScores(e.target.checked)}
                        id="modal_display_scores"
                      />
                      <label htmlFor="modal_display_scores" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Show scores on leaderboard</label>
                    </div>
                  </div>

                  <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPhaseDefIdRef(null);
                      }}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={globalSaveLoading}
                    >
                      {globalSaveLoading ? 'Saving...' : 'Save Configuration'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
