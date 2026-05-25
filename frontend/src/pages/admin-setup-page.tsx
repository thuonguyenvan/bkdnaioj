import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api, type Contest, type Task, type User, type ContestEntry, type PhaseDef, type Phase, type EvaluationSet } from '../lib/api-client';
import {
  Settings, CheckCircle2, XCircle, Plus, Upload, ArrowLeft, Trash2, AlertTriangle,
  LayoutGrid, FileText, Layers, Users, Volume2, LifeBuoy, ShieldCheck
} from 'lucide-react';

const REQUIRED_TASK_ASSETS = ['judge.py'];
const REQUIRED_EVALUATION_ASSETS = ['ground_truth', 'inputs'];

const buildSubmissionSchema = () => ({
  non_final: {
    description: 'Upload output artifact theo yêu cầu đề bài',
    examples: ['submission.zip', 'adversarial_images.zip', 'predictions.jsonl'],
    max_files: 10,
  },
  final: {
    description: 'Upload checkpoint/code inference theo yêu cầu đề bài',
    examples: ['final_submission.zip'],
    max_files: 10,
    inference_entrypoint: 'infer.py',
  },
  task_assets: {
    required_assets: REQUIRED_TASK_ASSETS,
    description: 'BTC uploads the shared task-level judge entrypoint once.',
  },
  evaluation: {
    required_assets: REQUIRED_EVALUATION_ASSETS,
    description: 'BTC uploads task-specific ground_truth and inputs assets for each public/private evaluation set. The concrete file formats are defined by BTC and consumed by judge.py/infer.py.',
  },
});

const requiredAssetsForSet = (set: EvaluationSet) => set.required_assets && set.required_assets.length > 0 ? set.required_assets : REQUIRED_EVALUATION_ASSETS;
const requiredTaskAssets = (task: Task) => task.required_assets && task.required_assets.length > 0 ? task.required_assets : REQUIRED_TASK_ASSETS;

const hasRequiredAssets = (set: EvaluationSet) => {
  const assetKeys = new Set(set.asset_keys || set.assets?.map(a => a.asset_key) || []);
  return requiredAssetsForSet(set).every(key => assetKeys.has(key));
};

const hasRequiredTaskAssets = (task: Task) => {
  const assetKeys = new Set(task.asset_keys || task.assets?.map(a => a.asset_key) || []);
  return requiredTaskAssets(task).every(key => assetKeys.has(key));
};

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
    enabled: subTab === 'tickets' || subTab === 'checklist',
  });

  // Load evaluation sets mapping for checklist
  const { data: taskEvalSets = {} } = useQuery<{ [taskId: string]: EvaluationSet[] }>({
    queryKey: ['taskEvalSets', contestId, tasks.length],
    queryFn: async () => {
      const mapping: { [taskId: string]: EvaluationSet[] } = {};
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

  const initializeEvaluationSets = async (task: Task) => {
    const existing = new Set((taskEvalSets[task.id] || []).map(s => s.key));
    if (!existing.has('public')) {
      await api.createEvaluationSet(task.id, { key: 'public', title: 'Public Evaluation Set' });
    }
    if (!existing.has('private')) {
      await api.createEvaluationSet(task.id, { key: 'private', title: 'Private Evaluation Set' });
    }
    queryClient.invalidateQueries({ queryKey: ['taskEvalSets', contestId] });
  };

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
    enabled: !!contestId && (subTab === 'entries' || subTab === 'checklist'),
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
      submission_schema: buildSubmissionSchema(),
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

  const handleTaskAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>, taskId: string, assetKey: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadProgress('initiating');
    setUploadError(null);
    try {
      const initRes = await api.initiateTaskAssets(taskId, {
        assets: [{
          asset_key: assetKey,
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
        }]
      });
      const uploadInfo = initRes.uploads[0];
      setUploadProgress('uploading');
      await axios.put(uploadInfo.put_url, file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        }
      });
      setUploadProgress('completing');
      await api.completeTaskAssets(taskId, {
        assets: [{
          asset_key: assetKey,
          filename: file.name,
          object_key: uploadInfo.object_key,
          size_bytes: file.size,
          content_type: file.type || 'application/octet-stream',
        }]
      });
      setUploadProgress('done');
      refetchTasks();
      setTimeout(() => setUploadProgress('idle'), 1500);
    } catch (err: any) {
      console.error(err);
      setUploadProgress('failed');
      setUploadError(err?.response?.data?.message || err?.message || 'Task asset upload failed.');
    }
  };

  // Checklist computation
  const checklist = {
    hasTasks: tasks.length > 0,
    hasEvalSets: tasks.length > 0 && tasks.every(t => (taskEvalSets[t.id]?.length || 0) > 0),
    hasJuryAssets: tasks.length > 0 && tasks.every(t => hasRequiredTaskAssets(t)) && tasks.every(t => {
      const sets = taskEvalSets[t.id] || [];
      return sets.length >= 2 && sets.every(s => hasRequiredAssets(s));
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
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 70px)', maxHeight: 'calc(100vh - 70px)', overflow: 'hidden', width: '100%', backgroundColor: '#f8fafc' }}>
      {/* Left Sidebar */}
      <aside
        style={{
          width: '260px',
          backgroundColor: '#0f172a',
          color: '#cbd5e1',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #1e293b',
          flexShrink: 0,
          padding: '1.5rem 1rem',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Header context */}
          <div style={{ padding: '0.5rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              BAN TỔ CHỨC
            </div>
            <div
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#ffffff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={contest?.title}
            >
              {contest?.title}
            </div>
          </div>

          {/* Navigation links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {[
              { id: 'checklist', label: 'Tổng quan & Publish', icon: LayoutGrid },
              { id: 'tasks', label: 'Bài tập (Tasks)', icon: FileText },
              { id: 'phases', label: 'Cấu hình (Phases)', icon: Layers },
              { id: 'entries', label: 'Thí sinh đăng ký', icon: Users },
              { id: 'announcements', label: 'Thông báo', icon: Volume2 },
              { id: 'tickets', label: 'Hỗ trợ (Tickets)', icon: LifeBuoy },
              { id: 'settings', label: 'Cài đặt cuộc thi', icon: Settings },
              { id: 'users', label: 'Người dùng & Vai trò', icon: ShieldCheck },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = subTab === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSubTab(item.id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    color: isActive ? '#ffffff' : '#94a3b8',
                    backgroundColor: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    borderLeft: isActive ? '4px solid #3b82f6' : '4px solid transparent',
                    cursor: 'pointer',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: '0.9rem',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = '#ffffff';
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = '#94a3b8';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <Icon size={18} style={{ color: isActive ? '#3b82f6' : '#64748b' }} />
                  {item.label}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Footer staff status */}
        <div style={{ padding: '0.5rem', borderTop: '1px solid #1e293b', paddingTop: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Đăng nhập với vai trò</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            Jury Staff / Admin
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          padding: '2rem 3rem',
          overflowY: 'auto',
          height: 'calc(100vh - 70px)',
          backgroundColor: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        {/* Header section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '1.5rem', marginBottom: '0.5rem' }}>
          <div>
            {/* Breadcrumbs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: 500 }}>
              <span>Jury Portal</span>
              <span>/</span>
              <span style={{ color: '#0f172a' }}>{contest?.title}</span>
            </div>

            {/* Title & Description */}
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {subTab === 'checklist' && 'Tổng quan & Publish cuộc thi'}
              {subTab === 'tasks' && 'Quản lý bài tập (Tasks)'}
              {subTab === 'entries' && 'Danh sách đăng ký thi'}
              {subTab === 'announcements' && 'Quản lý thông báo'}
              {subTab === 'tickets' && 'Trung tâm hỗ trợ (Tickets)'}
              {subTab === 'phases' && 'Cấu hình giai đoạn (Phases)'}
              {subTab === 'settings' && 'Cài đặt chi tiết cuộc thi'}
              {subTab === 'users' && 'Quản lý vai trò người dùng'}

              {/* Status Badge */}
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: contest?.status === 'running' ? '#dcfce7' : '#fef3c7',
                  color: contest?.status === 'running' ? '#166534' : '#92400e',
                  border: contest?.status === 'running' ? '1px solid #bbf7d0' : '1px solid #fde68a',
                  marginLeft: '0.5rem',
                }}
              >
                {contest?.status}
              </span>
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '0.35rem', marginBottom: 0 }}>
              {subTab === 'checklist' && 'Kiểm tra trạng thái tài nguyên, cập nhật cấu hình và kích hoạt cuộc thi.'}
              {subTab === 'tasks' && 'Tạo, xóa và thiết lập submission contract cùng tài nguyên chấm bài.'}
              {subTab === 'entries' && 'Kiểm duyệt trạng thái đăng ký của các thí sinh (Official, Virtual, Practice).'}
              {subTab === 'announcements' && 'Tạo và quản lý các thông báo quan trọng gửi đến các thí sinh.'}
              {subTab === 'tickets' && 'Tiếp nhận, xử lý và phân công giải quyết các yêu cầu hỗ trợ từ thí sinh.'}
              {subTab === 'phases' && 'Thiết lập các mốc thời gian diễn ra các phase chính thức/thử nghiệm.'}
              {subTab === 'settings' && 'Chỉnh sửa thông tin chung, cài đặt normalization hoặc xóa cuộc thi.'}
              {subTab === 'users' && 'Phân quyền vai trò hệ thống (Admin, Jury, Contestant) cho các tài khoản.'}
            </p>
          </div>

          {/* Action button */}
          <Link
            to={`/contests/${contestId}`}
            className="btn btn-secondary flex items-center gap-2"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
            }}
          >
            <ArrowLeft size={14} /> Back to Contest
          </Link>
        </div>

      {/* Checklist & Publish Tab */}
      {subTab === 'checklist' && (
        <>
          {/* Dashboard Stats Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            {/* Contest Status */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trạng thái cuộc thi</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: contest?.status === 'running' ? '#22c55e' : '#f59e0b', display: 'inline-block' }}></span>
                  <span style={{ textTransform: 'capitalize' }}>{contest?.status}</span>
                </div>
              </div>
              <div style={{ width: '44px', height: '44px', borderRadius: '8px', backgroundColor: contest?.status === 'running' ? '#dcfce7' : '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Settings size={20} style={{ color: contest?.status === 'running' ? '#166534' : '#92400e' }} />
              </div>
            </div>

            {/* Total Tasks */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bài tập thử thách</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginTop: '0.25rem' }}>
                  {tasks.length} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>Tasks</span>
                </div>
              </div>
              <div style={{ width: '44px', height: '44px', borderRadius: '8px', backgroundColor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={20} style={{ color: '#3730a3' }} />
              </div>
            </div>

            {/* Registrations count */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thí sinh đăng ký</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginTop: '0.25rem' }}>
                  {contestEntries.length} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>Đội/Cá nhân</span>
                </div>
              </div>
              <div style={{ width: '44px', height: '44px', borderRadius: '8px', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={20} style={{ color: '#065f46' }} />
              </div>
            </div>

            {/* Tickets count */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Yêu cầu hỗ trợ</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginTop: '0.25rem' }}>
                  {tickets.length} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>Tickets</span>
                </div>
              </div>
              <div style={{ width: '44px', height: '44px', borderRadius: '8px', backgroundColor: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LifeBuoy size={20} style={{ color: '#075985' }} />
              </div>
            </div>
          </div>

          {/* Checklist content grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            {/* Checklist items panel */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.25rem', marginTop: 0 }}>
                Contest Readiness Checklist
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Item 1: Tasks Config */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    {checklist.hasTasks ? (
                      <CheckCircle2 size={20} style={{ color: '#22c55e' }} />
                    ) : (
                      <XCircle size={20} style={{ color: '#ef4444' }} />
                    )}
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block' }}>Task Configuration</strong>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>At least 1 programming/prediction task created.</span>
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, padding: '0.2rem 0.5rem', backgroundColor: '#e2e8f0', borderRadius: '4px', color: '#334155' }}>
                    {tasks.length} tasks
                  </span>
                </div>

                {/* Item 2: Eval Sets */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    {checklist.hasEvalSets ? (
                      <CheckCircle2 size={20} style={{ color: '#22c55e' }} />
                    ) : (
                      <XCircle size={20} style={{ color: '#ef4444' }} />
                    )}
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block' }}>Evaluation Sets Defined</strong>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Each task must possess an active evaluation config target.</span>
                    </div>
                  </div>
                </div>

                {/* Item 3: Jury Assets */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    {checklist.hasJuryAssets ? (
                      <CheckCircle2 size={20} style={{ color: '#22c55e' }} />
                    ) : (
                      <XCircle size={20} style={{ color: '#ef4444' }} />
                    )}
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block' }}>Jury Assets Uploaded</strong>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Required assets are defined by each task submission contract.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Publish gate panel */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem', marginTop: 0 }}>Publish Contest Gate</h3>
                <p style={{ fontSize: '0.825rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                  Publishing locks editing of parameters and initiates registration queues.
                </p>
                <div style={{ margin: '1.25rem 0 0.5rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>Current Status:</span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: contest?.status === 'running' ? '#dcfce7' : '#fef3c7',
                      color: contest?.status === 'running' ? '#15803d' : '#b45309',
                    }}
                  >
                    {contest?.status}
                  </span>
                </div>
              </div>

              <div>
                {contest?.status === 'draft' ? (
                  <button
                    onClick={() => publishContestMutation.mutate()}
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '0.625rem', borderRadius: '8px', fontSize: '0.9rem' }}
                    disabled={!checklist.isReady || publishContestMutation.isPending}
                  >
                    {publishContestMutation.isPending ? 'Publishing...' : 'Publish Contest'}
                  </button>
                ) : (
                  <button className="btn btn-secondary" style={{ width: '100%', padding: '0.625rem', borderRadius: '8px', fontSize: '0.9rem' }} disabled>
                    Already Published
                  </button>
                )}
                {!checklist.isReady && contest?.status === 'draft' && (
                  <p style={{ fontSize: '0.75rem', color: '#ef4444', margin: '0.5rem 0.5rem 0', textAlign: 'center', lineHeight: 1.3 }}>
                    Please complete the readiness checklist to enable the publish gate.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Manage Tasks Tab */}
      {subTab === 'tasks' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Create Task Form */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.25rem', marginTop: 0 }}>Thêm bài tập mới</h3>
            {taskError && (
              <div className="alert alert-danger" style={{ fontSize: '0.8rem', padding: '0.75rem', borderRadius: '6px' }}>{taskError}</div>
            )}
            <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Tên bài tập *</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                  value={taskTitle}
                  onChange={(e) => {
                    setTaskTitle(e.target.value);
                    setTaskSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                  }}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Slug định danh *</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                  value={taskSlug}
                  onChange={(e) => setTaskSlug(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Mô tả ngắn</label>
                <textarea
                  className="form-input"
                  style={{ height: '70px', resize: 'vertical', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Score Metrics Label</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                  value={taskScoreLabel}
                  onChange={(e) => setTaskScoreLabel(e.target.value)}
                  placeholder="e.g. Accuracy / F1"
                />
              </div>

              <div className="form-group flex items-center gap-2" style={{ marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={taskHigherBetter}
                  onChange={(e) => setTaskHigherBetter(e.target.checked)}
                  id="higher_is_better"
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="higher_is_better" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>Điểm càng cao càng tốt</label>
              </div>

              <div className="form-group" style={{ marginBottom: 0, padding: '0.85rem', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '0.6rem', display: 'block' }}>Submission contract</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.78rem', color: '#475569', lineHeight: 1.35 }}>
                  <div>
                    <strong style={{ color: '#0f172a' }}>Non-final:</strong> thí sinh nộp output artifact đã sinh sẵn.
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>Final:</strong> thí sinh nộp ZIP có `infer.py` và checkpoint/code; hệ thống chạy inference từ asset `inputs`.
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>BTC upload một lần ở cấp task:</strong>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                      {REQUIRED_TASK_ASSETS.map(asset => (
                        <span key={asset} className="font-mono" style={{ padding: '0.2rem 0.45rem', backgroundColor: '#e0f2fe', color: '#075985', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                          {asset}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <strong style={{ color: '#0f172a' }}>BTC upload cho mỗi public/private set:</strong>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                      {REQUIRED_EVALUATION_ASSETS.map(asset => (
                        <span key={asset} className="font-mono" style={{ padding: '0.2rem 0.45rem', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                          {asset}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                disabled={createTaskMutation.isPending}
              >
                {createTaskMutation.isPending ? 'Đang lưu...' : 'Thêm bài tập'}
              </button>
            </form>
          </div>

          {/* Task Assets management */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {tasks.length === 0 ? (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '3rem 2rem', textAlign: 'center', color: '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                Chưa có bài tập nào được thêm vào cuộc thi này.
              </div>
            ) : (
              tasks.map(t => {
                const sets = taskEvalSets[t.id] || [];

                return (
                  <div key={t.id} style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{t.title}</h4>
                        <span style={{ fontFamily: 'var(--font-mono)', color: '#64748b', fontSize: '0.75rem' }}>slug ID: {t.slug}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete the task "${t.title}"? This will delete all evaluation sets and contestant submissions associated with this task.`)) {
                            deleteTaskMutation.mutate(t.id);
                          }
                        }}
                        className="btn btn-danger"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
                        disabled={deleteTaskMutation.isPending}
                      >
                        <Trash2 size={13} /> Xóa bài tập
                      </button>
                    </div>

                    <div style={{ marginBottom: '1rem', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a', marginBottom: '0.8rem' }}>
                        Shared task judge
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        {requiredTaskAssets(t).map((assetKey) => {
                          const present = (t.asset_keys || []).includes(assetKey);
                          const inputId = `task-asset-upload-${t.id}-${assetKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                          return (
                            <div key={assetKey} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', gap: '1rem' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                  <span>{assetKey}</span>
                                  {present ? (
                                    <span style={{ color: '#22c55e', fontSize: '0.75rem', fontWeight: 600 }}>✓ Present</span>
                                  ) : (
                                    <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>✗ Missing</span>
                                  )}
                                </div>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.3, display: 'block' }}>Shared judge used by public/private and normal/final phases.</span>
                              </div>
                              <input
                                type="file"
                                id={inputId}
                                style={{ display: 'none' }}
                                onChange={(e) => handleTaskAssetUpload(e, t.id, assetKey)}
                              />
                              <button
                                onClick={() => document.getElementById(inputId)?.click()}
                                className="btn btn-secondary flex items-center gap-1"
                                style={{ width: '100%', padding: '0.4rem', fontSize: '0.75rem', justifyContent: 'center' }}
                                disabled={uploadProgress !== 'idle'}
                              >
                                <Upload size={12} /> Upload Judge
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      {sets.length === 0 ? (
                        <div style={{ padding: '1rem', backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
                          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.75rem 0' }}>Chưa khởi tạo bộ dữ liệu đánh giá cho bài tập này.</p>
                          <button
                            onClick={() => initializeEvaluationSets(t)}
                            className="btn btn-secondary flex items-center gap-1"
                            style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem', margin: '0 auto' }}
                            disabled={createEvaluationSetMutation.isPending}
                          >
                            <Plus size={12} /> Khởi tạo public/private eval sets
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {(!sets.some(s => s.key === 'public') || !sets.some(s => s.key === 'private')) && (
                            <div style={{ padding: '0.85rem', border: '1px solid #fde68a', backgroundColor: '#fffbeb', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.8rem', color: '#92400e' }}>Task này chưa có đủ public/private evaluation sets.</span>
                              <button
                                onClick={() => initializeEvaluationSets(t)}
                                className="btn btn-secondary"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              >
                                Bổ sung eval sets
                              </button>
                            </div>
                          )}
                          {sets.map((s) => (
                            <div key={s.id} style={{ border: '1px solid #f1f5f9', padding: '1rem', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                  Bộ dữ liệu chấm: {s.title}
                                </span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#64748b' }}>
                                  ID: {s.id}
                                </span>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                {requiredAssetsForSet(s).map((assetKey) => {
                                  const present = (s.asset_keys || []).includes(assetKey);
                                  const inputId = `asset-upload-${s.id}-${assetKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                                  return (
                                    <div key={assetKey} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', gap: '1rem' }}>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                          <span>{assetKey}</span>
                                          {present ? (
                                            <span style={{ color: '#22c55e', fontSize: '0.75rem', fontWeight: 600 }}>✓ Present</span>
                                          ) : (
                                            <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>✗ Missing</span>
                                          )}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.3, display: 'block' }}>Required evaluation asset from this task contract.</span>
                                      </div>
                                      <input
                                        type="file"
                                        id={inputId}
                                        style={{ display: 'none' }}
                                        onChange={(e) => handleAssetUpload(e, s.id, assetKey)}
                                      />
                                      <button
                                        onClick={() => document.getElementById(inputId)?.click()}
                                        className="btn btn-secondary flex items-center gap-1"
                                        style={{ width: '100%', padding: '0.4rem', fontSize: '0.75rem', justifyContent: 'center' }}
                                        disabled={uploadProgress !== 'idle'}
                                      >
                                        <Upload size={12} /> Upload Asset
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}

                          {uploadError && (
                            <div className="alert alert-danger" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', marginBottom: 0 }}>
                              {uploadError}
                            </div>
                          )}

                          {uploadProgress !== 'idle' && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', marginTop: '0.25rem' }}>
                              Trạng thái upload: <strong style={{ color: '#0f172a' }}>{uploadProgress}</strong>
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

      {subTab === 'entries' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Danh sách đăng ký thi</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {contestEntries.length === 0 ? (
              <p style={{ padding: '3rem 2rem', textAlign: 'center', color: '#64748b', margin: 0 }}>Chưa có thí sinh hoặc đội thi nào đăng ký cuộc thi này.</p>
            ) : (
              <table className="oj-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tên hiển thị / Tên Đội</th>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hình thức</th>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chế độ tham gia</th>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trạng thái duyệt</th>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em', width: '220px', textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {contestEntries.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '1rem 1.5rem', fontWeight: 600, color: '#0f172a' }}>{e.display_name}</td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', backgroundColor: '#f1f5f9', color: '#475569' }}>
                          {e.entry_type}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                          {e.entry_mode}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            backgroundColor: e.status === 'approved' || e.status === 'active' ? '#dcfce7' : e.status === 'disqualified' ? '#fee2e2' : '#fef3c7',
                            color: e.status === 'approved' || e.status === 'active' ? '#15803d' : e.status === 'disqualified' ? '#b91c1c' : '#b45309',
                          }}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          {(e.status === 'pending' || e.status === 'disqualified') && (
                            <button
                              onClick={() => approveEntryMutation.mutate(e.id)}
                              className="btn btn-primary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
                              disabled={approveEntryMutation.isPending}
                            >
                              Phê duyệt
                            </button>
                          )}
                          {(e.status === 'pending' || e.status === 'approved' || e.status === 'active') && (
                            <button
                              onClick={() => disqualifyEntryMutation.mutate(e.id)}
                              className="btn btn-danger"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px' }}
                              disabled={disqualifyEntryMutation.isPending}
                            >
                              Hủy tư cách
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

      {subTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '700px' }}>
          {/* Edit Details Panel */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.5rem', marginTop: 0 }}>Cấu hình thông tin cuộc thi</h3>

            {settingsError && (
              <div className="alert alert-danger" style={{ fontSize: '0.85rem', padding: '0.75rem', borderRadius: '6px' }}>
                {settingsError}
              </div>
            )}

            {settingsSuccess && (
              <div className="alert alert-success" style={{ fontSize: '0.85rem', padding: '0.75rem', borderRadius: '6px' }}>
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
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.85rem', color: '#475569' }}>Tên cuộc thi</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ padding: '0.6rem 0.85rem', fontSize: '0.9rem' }}
                  value={settingsTitle}
                  onChange={(e) => setSettingsTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.85rem', color: '#475569' }}>Mô tả chi tiết</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: '100px', padding: '0.6rem 0.85rem', fontSize: '0.9rem' }}
                  value={settingsDesc}
                  onChange={(e) => setSettingsDesc(e.target.value)}
                />
              </div>

              <div className="grid-2" style={{ gap: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.85rem', color: '#475569' }}>Thời gian bắt đầu</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={settingsStartTime}
                    onChange={(e) => setSettingsStartTime(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.85rem', color: '#475569' }}>Thời gian kết thúc</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    value={settingsEndTime}
                    onChange={(e) => setSettingsEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid-2" style={{ gap: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.85rem', color: '#475569' }}>Đối tượng đăng ký</label>
                  <select
                    className="form-input"
                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', height: 'auto' }}
                    value={settingsEntryPolicy}
                    onChange={(e) => setSettingsEntryPolicy(e.target.value as any)}
                  >
                    <option value="individual">Cá nhân (Individual)</option>
                    <option value="team">Đội nhóm (Team Only)</option>
                    <option value="both">Cả hai (Individual & Team)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.85rem', color: '#475569' }}>Chế độ hiển thị</label>
                  <select
                    className="form-input"
                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', height: 'auto' }}
                    value={settingsVisibility}
                    onChange={(e) => setSettingsVisibility(e.target.value as any)}
                  >
                    <option value="public">Công khai (Public)</option>
                    <option value="private">Riêng tư (Private - Code đăng ký)</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={settingsRequireApproval}
                    onChange={(e) => setSettingsRequireApproval(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Yêu cầu Ban tổ chức duyệt khi đăng ký
                </label>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={settingsScaleScores}
                    onChange={(e) => setSettingsScaleScores(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Chuẩn hóa điểm số (Scale scores về tối đa 100 điểm)
                </label>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ marginTop: '0.5rem', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', alignSelf: 'flex-start' }}
                disabled={updateContestMutation.isPending}
              >
                {updateContestMutation.isPending ? 'Đang lưu cấu hình...' : 'Lưu cài đặt'}
              </button>
            </form>
          </div>

          {/* Danger Zone Panel */}
          <div style={{ backgroundColor: '#fff5f5', borderRadius: '12px', border: '1px solid #fee2e2', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ color: '#dc2626', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <AlertTriangle size={20} /> Vùng nguy hiểm (Danger Zone)
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#7f1d1d', margin: 0, lineHeight: 1.4 }}>
              Khi xóa cuộc thi, toàn bộ dữ liệu bao gồm các giai đoạn (phases), bài tập (tasks), mã nguồn nộp chấm, danh sách đăng ký và các cuộc hội thoại hỗ trợ sẽ bị xóa vĩnh viễn khỏi hệ thống. Thao tác này không thể khôi phục.
            </p>
            <button
              type="button"
              className="btn btn-danger"
              style={{
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                borderRadius: '8px',
                width: 'fit-content',
                fontWeight: 600,
              }}
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
              {deleteContestMutation.isPending ? 'Đang xóa cuộc thi...' : 'Xóa cuộc thi vĩnh viễn'}
            </button>
          </div>
        </div>
      )}

      {subTab === 'users' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Tài khoản & Phân quyền hệ thống</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="oj-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tên người dùng</th>
                  <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Địa chỉ Email</th>
                  <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vai trò hiện tại</th>
                  <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em', width: '320px', textAlign: 'right' }}>Gán vai trò mới</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: 600, color: '#0f172a' }}>{u.full_name}</td>
                    <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#475569' }}>{u.email}</td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          backgroundColor: u.role === 'admin' ? '#fee2e2' : u.role === 'jury' ? '#fef3c7' : '#dcfce7',
                          color: u.role === 'admin' ? '#b91c1c' : u.role === 'jury' ? '#b45309' : '#15803d',
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => updateUserRoleMutation.mutate({ id: u.id, role: 'admin' })}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px' }}
                            disabled={updateUserRoleMutation.isPending}
                          >
                            Set Admin
                          </button>
                        )}
                        {u.role !== 'jury' && (
                          <button
                            onClick={() => updateUserRoleMutation.mutate({ id: u.id, role: 'jury' })}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px' }}
                            disabled={updateUserRoleMutation.isPending}
                          >
                            Set Jury
                          </button>
                        )}
                        {u.role !== 'contestant' && (
                          <button
                            onClick={() => updateUserRoleMutation.mutate({ id: u.id, role: 'contestant' })}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px' }}
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

      {subTab === 'announcements' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.2fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Announcements list */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.25rem', marginTop: 0 }}>Danh sách thông báo đã đăng</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {announcements.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>Chưa có thông báo nào được đăng.</p>
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
                        padding: '1.25rem',
                        borderRadius: '8px',
                        border: ann.is_pinned ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                        backgroundColor: ann.is_pinned ? '#f0f7ff' : '#ffffff',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                        position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '1rem' }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {ann.is_pinned && (
                              <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', backgroundColor: '#3b82f6', color: '#ffffff', borderRadius: '4px', fontWeight: 700 }}>
                                GHIM
                              </span>
                            )}
                            {ann.title}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: '#64748b', fontSize: '0.7rem', display: 'block', marginTop: '0.2rem' }}>
                            ID: {ann.id} | Đăng lúc: {new Date(ann.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            onClick={() => {
                              setEditingAnnId(ann.id);
                              setAnnTitle(ann.title);
                              setAnnContent(ann.content);
                              setAnnIsPinned(ann.is_pinned);
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '4px' }}
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('Delete this announcement?')) {
                                deleteAnnouncementMutation.mutate(ann.id);
                              }
                            }}
                            className="btn btn-danger"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '4px' }}
                          >
                            Xóa
                          </button>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.85rem', margin: 0, whiteSpace: 'pre-line', color: '#334155', lineHeight: 1.5 }}>
                        {ann.content}
                      </p>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Form Create/Edit */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.25rem', marginTop: 0 }}>
              {editingAnnId ? 'Cập nhật thông báo' : 'Tạo thông báo mới'}
            </h3>
            {annError && <div className="alert alert-danger" style={{ fontSize: '0.8rem', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>{annError}</div>}
            {annSuccess && <div className="alert alert-success" style={{ fontSize: '0.8rem', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>{annSuccess}</div>}

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
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Tiêu đề *</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="Tiêu đề thông báo..."
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Nội dung thông báo *</label>
                <textarea
                  className="form-input"
                  value={annContent}
                  onChange={(e) => setAnnContent(e.target.value)}
                  placeholder="Hỗ trợ Markdown hoặc chữ thường..."
                  required
                  style={{ height: '150px', resize: 'vertical', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                />
              </div>

              <div className="form-group flex items-center gap-2" style={{ marginBottom: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={annIsPinned}
                  onChange={(e) => setAnnIsPinned(e.target.checked)}
                  id="ann_is_pinned"
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="ann_is_pinned" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>Ghim thông báo lên trên đầu</label>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', fontSize: '0.85rem' }}
                  disabled={createAnnouncementMutation.isPending || updateAnnouncementMutation.isPending}
                >
                  {editingAnnId ? 'Cập nhật' : 'Đăng thông báo'}
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
                    style={{ padding: '0.5rem', borderRadius: '8px', fontSize: '0.85rem' }}
                  >
                    Hủy
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {subTab === 'tickets' && (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Trung tâm hỗ trợ (Tickets)</h3>
            
            {/* Filter by status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Lọc trạng thái:</label>
              <select
                className="form-input"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', width: '150px', borderRadius: '6px', height: 'auto' }}
                value={ticketFilterStatus}
                onChange={(e) => setTicketFilterStatus(e.target.value)}
              >
                <option value="">Tất cả Tickets</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            {tickets.length === 0 ? (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#64748b' }}>
                Không tìm thấy yêu cầu hỗ trợ nào.
              </div>
            ) : (
              <table className="oj-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thời gian gửi</th>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phân loại & Độ ưu tiên</th>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Đội thi ID</th>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chủ đề & Nội dung</th>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bài nộp liên kết</th>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trạng thái xử lý</th>
                    <th style={{ padding: '0.85rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em', width: '180px' }}>Phân công & Phê duyệt</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(ticket => (
                    <tr key={ticket.id} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                      <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(ticket.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <span style={{ display: 'inline-block', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', backgroundColor: '#e0f2fe', color: '#0369a1', width: 'fit-content' }}>
                            {ticket.category}
                          </span>
                          
                          {/* Priority dropdown */}
                          <select
                            className="form-input"
                            style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', height: 'auto', width: '100px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
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
                      <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#475569', wordBreak: 'break-all', maxWidth: '120px' }}>
                        {ticket.contest_entry_id}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.25rem' }}>{ticket.subject}</div>
                        <p style={{ fontSize: '0.8rem', color: '#334155', whiteSpace: 'pre-line', margin: 0, maxWidth: '280px', lineHeight: 1.4 }}>
                          {ticket.description}
                        </p>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        {ticket.submission_id ? (
                          <code style={{ fontSize: '0.75rem', padding: '0.15rem 0.3rem', backgroundColor: '#f1f5f9', borderRadius: '4px', color: '#475569' }}>
                            {ticket.submission_id.slice(-6)}
                          </code>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>None</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              width: 'fit-content',
                              backgroundColor: ticket.status === 'resolved' ? '#dcfce7' : ticket.status === 'rejected' ? '#fee2e2' : ticket.status === 'in_progress' ? '#e0f2fe' : '#fef3c7',
                              color: ticket.status === 'resolved' ? '#15803d' : ticket.status === 'rejected' ? '#b91c1c' : ticket.status === 'in_progress' ? '#0369a1' : '#b45309',
                            }}
                          >
                            {ticket.status.replace('_', ' ')}
                          </span>

                          {/* Status dropdown */}
                          <select
                            className="form-input"
                            style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem', height: 'auto', width: '110px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
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
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '150px' }}>
                          {/* Assignment status */}
                          <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span style={{ color: '#64748b' }}>
                              {ticket.assigned_to ? `Phân công: ${ticket.assigned_to}` : 'Chưa phân công'}
                            </span>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button
                                onClick={() => updateTicketMutation.mutate({
                                  id: ticket.id,
                                  payload: { assigned_to: 'Jury Staff' }
                                })}
                                className="btn btn-secondary"
                                style={{ padding: '0.15rem 0.3rem', fontSize: '0.7rem', flex: 1, borderRadius: '4px' }}
                                disabled={updateTicketMutation.isPending || ticket.assigned_to === 'Jury Staff'}
                              >
                                Nhận việc
                              </button>
                              {ticket.assigned_to && (
                                <button
                                  onClick={() => updateTicketMutation.mutate({
                                    id: ticket.id,
                                    payload: { assigned_to: null }
                                  })}
                                  className="btn btn-secondary"
                                  style={{ padding: '0.15rem 0.3rem', fontSize: '0.7rem', color: '#ef4444', borderRadius: '4px' }}
                                  disabled={updateTicketMutation.isPending}
                                >
                                  Hủy
                                </button>
                              )}
                            </div>
                          </div>

                          {ticket.status !== 'resolved' && (
                            <button
                              onClick={() => resolveTicketMutation.mutate(ticket.id)}
                              className="btn btn-primary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', width: '100%', borderRadius: '6px', justifyContent: 'center' }}
                              disabled={resolveTicketMutation.isPending}
                            >
                              Giải quyết xong
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Unified Contest Phases Management Panel */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.35rem', marginTop: 0 }}>Quản lý các giai đoạn cuộc thi (Phases)</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.25rem', marginTop: 0, lineHeight: 1.4 }}>
              Cài đặt các Phase chạy tự động (phân chia mốc thời gian, bộ test công khai/bí mật, giới hạn nộp bài và chế độ hiển thị bảng xếp hạng).
            </p>
            
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table className="oj-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mã Phase</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tên giai đoạn</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em', width: '80px' }}>Thứ tự</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lịch trình mở - đóng</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Script chấm</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em', width: '80px' }}>Giới hạn</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chế độ nộp</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em', width: '110px' }}>Hiện điểm</th>
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em', width: '120px', textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {phaseDefs.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        Chưa có phase nào được định nghĩa. Hãy nhấn nút tự động thêm các Phase mẫu phía dưới.
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
                        <tr key={def.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#475569' }}>{def.key}</td>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#0f172a' }}>{def.title}</td>
                          <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>{def.sort_order}</td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {openTime && closeTime ? (
                              <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#dcfce7', color: '#15803d' }}>
                                {timingStr}
                              </span>
                            ) : (
                              <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#fef3c7', color: '#b45309' }}>
                                Chưa cài lịch
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#475569' }}>{repPhase?.judge_key || '-'}</td>
                          <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>{repPhase?.submission_limit !== null && repPhase?.submission_limit !== undefined ? `${repPhase.submission_limit} lần` : 'Không giới hạn'}</td>
                          <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>
                            {repPhase?.leaderboard_mode ? (
                              repPhase.leaderboard_mode === 'best' ? 'Lấy điểm cao nhất' : 'Lấy bài nộp cuối'
                            ) : (
                              '-'
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>{repPhase ? (repPhase.display_scores ? 'Có' : 'Không') : '-'}</td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
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
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', borderRadius: '4px' }}
                              >
                                Sửa
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
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', borderRadius: '4px' }}
                              >
                                Xóa
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
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '8px' }}
              >
                <Plus size={12} /> Tự động khởi tạo các Phase mẫu còn thiếu
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
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}>
              <div style={{
                width: '100%',
                maxWidth: '560px',
                maxHeight: '90vh',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #cbd5e1',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                padding: '1.75rem',
                margin: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                    Cấu hình mốc thời gian & chế độ chấm
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPhaseDefIdRef(null);
                    }}
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderRadius: '6px' }}
                  >
                    Đóng
                  </button>
                </div>

                <form onSubmit={handleSaveGlobalPhase} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Tên giai đoạn *</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        value={editingPhaseDefTitle}
                        onChange={(e) => setEditingPhaseDefTitle(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Thứ tự sắp xếp *</label>
                      <input
                        type="number"
                        className="form-input"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        value={editingPhaseDefSortOrder}
                        onChange={(e) => setEditingPhaseDefSortOrder(parseInt(e.target.value, 10))}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Thời gian mở Phase *</label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        value={editingPhaseOpenTime}
                        onChange={(e) => setEditingPhaseOpenTime(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Thời gian đóng Phase *</label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        value={editingPhaseCloseTime}
                        onChange={(e) => setEditingPhaseCloseTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Key file chấm bài (Jury script) *</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        value={editingPhaseJudgeKey}
                        onChange={(e) => setEditingPhaseJudgeKey(e.target.value)}
                        placeholder="e.g. judge.py"
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Giới hạn lượt nộp bài</label>
                      <input
                        type="number"
                        className="form-input"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        value={editingPhaseSubmissionLimit}
                        onChange={(e) => setEditingPhaseSubmissionLimit(e.target.value)}
                        placeholder="Để trống: không giới hạn"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', alignItems: 'center' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem', color: '#475569' }}>Chế độ lấy điểm xếp hạng</label>
                      <select
                        className="form-input"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', height: 'auto' }}
                        value={editingPhaseLeaderboardMode}
                        onChange={(e) => setEditingPhaseLeaderboardMode(e.target.value as any)}
                      >
                        <option value="best">Lấy điểm cao nhất (Best score)</option>
                        <option value="latest">Lấy điểm bài nộp cuối (Latest score)</option>
                      </select>
                    </div>

                    <div className="form-group flex items-center gap-2" style={{ marginBottom: 0, height: '100%', paddingTop: '1.25rem' }}>
                      <input
                        type="checkbox"
                        checked={editingPhaseDisplayScores}
                        onChange={(e) => setEditingPhaseDisplayScores(e.target.checked)}
                        id="modal_display_scores"
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor="modal_display_scores" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>Hiển thị điểm lên bảng xếp hạng</label>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPhaseDefIdRef(null);
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}
                      disabled={globalSaveLoading}
                    >
                      {globalSaveLoading ? 'Đang lưu cấu hình...' : 'Lưu & Đồng bộ (Sync)'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
      </main>
    </div>
  );
};
