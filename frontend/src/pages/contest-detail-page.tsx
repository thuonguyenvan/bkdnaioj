import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Contest, type PhaseDef, type ContestEntry, type Team, type Announcement, type Task, type Phase, type Clarification, type Ticket, type LeaderboardRow } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import { User, Users, Settings, ArrowLeft, CheckCircle2, AlertCircle, Volume2, Plus, ArrowRight, Loader2, CalendarDays, Clock, Info, ListChecks } from 'lucide-react';

const PHASE_DISPLAY_ORDER: Record<PhaseDef['key'], number> = {
  public_test: 0,
  final_public: 1,
  private_test: 2,
  final_private: 3,
};

const PHASE_LABELS: Record<PhaseDef['key'], string> = {
  public_test: 'Public Test',
  final_public: 'Final Public',
  private_test: 'Private Test',
  final_private: 'Final Private',
};

const sortPhaseDefsForDisplay = (defs: PhaseDef[]) =>
  [...defs].sort((a, b) => (PHASE_DISPLAY_ORDER[a.key] ?? a.sort_order) - (PHASE_DISPLAY_ORDER[b.key] ?? b.sort_order));

const getPhaseLabel = (def: PhaseDef) => PHASE_LABELS[def.key] || def.key.replace(/_/g, ' ');

export const ContestDetailPage: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { user, isAdmin, isJury } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [registerError, setRegisterError] = useState<string | null>(null);
  const [activeContestTab, setActiveContestTab] = useState<'overview' | 'standings' | 'clarifications' | 'tickets'>('overview');
  const [selectedContestStandingPhaseId, setSelectedContestStandingPhaseId] = useState('');
  const [selectedContestStandingMode, setSelectedContestStandingMode] = useState<'both' | 'official' | 'virtual' | 'practice'>('both');
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaTaskId, setQaTaskId] = useState('');
  const [qaError, setQaError] = useState<string | null>(null);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [qaAnswer, setQaAnswer] = useState('');
  const [isPublicAnswer, setIsPublicAnswer] = useState(true);
  const [ticketCategory, setTicketCategory] = useState<'upload' | 'judge' | 'score' | 'system'>('system');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);

  // Queries
  const { data: contest, isLoading: loadingContest, error: contestError } = useQuery<Contest>({
    queryKey: ['contest', contestId],
    queryFn: () => api.getContest(contestId!),
    enabled: !!contestId,
  });

  const { data: phaseDefs = [], isLoading: loadingPhaseDefs } = useQuery<PhaseDef[]>({
    queryKey: ['phaseDefs', contestId],
    queryFn: () => api.getPhaseDefs(contestId!),
    enabled: !!contestId,
  });

  const { data: entries = [], isLoading: loadingEntries } = useQuery<ContestEntry[]>({
    queryKey: ['entries', contestId],
    queryFn: () => api.getEntries(contestId!),
    enabled: !!contestId && !!user,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', contestId],
    queryFn: () => api.getTasks(contestId!),
    enabled: !!contestId,
  });

  const firstTaskId = tasks[0]?.id;

  const { data: firstTaskPhases = [] } = useQuery<Phase[]>({
    queryKey: ['taskPhases', contestId, 'first', firstTaskId],
    queryFn: () => api.getPhasesByTask(firstTaskId!),
    enabled: !!firstTaskId,
  });

  // Load user's teams
  const { data: myTeams = [], isLoading: loadingMyTeams } = useQuery<Team[]>({
    queryKey: ['myTeams'],
    queryFn: () => api.getMyTeams(),
    enabled: !!user,
  });

  // Check user registration status
  const userEntries = entries.filter(
    e => e.user_id === user?.id || 
         e.registered_by === user?.id || 
         (e.team_id && myTeams.some(t => t.id === e.team_id))
  );
  const approvedEntries = userEntries.filter(
    e => e.status === 'approved' || e.status === 'active' || e.status === 'finished'
  );
  const isRegistered = userEntries.length > 0;

  useEffect(() => {
    const regModes = userEntries.map(e => e.entry_mode);
    const availModes = (['official', 'virtual', 'practice'] as const).filter(m => !regModes.includes(m));
    if (availModes.length > 0 && !availModes.includes(selectedEntryMode)) {
      setSelectedEntryMode(availModes[0]);
    }
  }, [userEntries]);

  // Load announcements
  const { data: announcements = [], isLoading: loadingAnnouncements } = useQuery<Announcement[]>({
    queryKey: ['announcements', contestId],
    queryFn: () => api.getAnnouncements(contestId!),
    enabled: !!contestId,
  });

  const { data: clarifications = [], refetch: refetchClarifications } = useQuery<Clarification[]>({
    queryKey: ['clarifications', contestId],
    queryFn: () => api.getClarifications(contestId!),
    enabled: !!contestId,
  });

  const { data: myTickets = [], refetch: refetchMyTickets } = useQuery<Ticket[]>({
    queryKey: ['myTickets'],
    queryFn: () => api.listMyTickets(),
    enabled: !!user,
  });

  const { data: contestPhaseStandings = [], isLoading: loadingContestStandings } = useQuery<Array<{ phaseDef: PhaseDef; rows: LeaderboardRow[] }>>({
    queryKey: ['contest-phase-standings', contestId, phaseDefs.map(def => def.id).join(','), selectedContestStandingMode],
    queryFn: async () => {
      const results = await Promise.all(
        phaseDefs.map(async (phaseDef) => {
          try {
            const rows = await api.getContestPhaseLeaderboard(
              contestId!,
              phaseDef.id,
              selectedContestStandingMode === 'both' ? undefined : selectedContestStandingMode
            );
            return { phaseDef, rows };
          } catch (err) {
            console.error(`Failed to load contest standings for phase ${phaseDef.id}`, err);
            return { phaseDef, rows: [] };
          }
        })
      );
      return results;
    },
    enabled: !!contestId && phaseDefs.length > 0,
  });

  useEffect(() => {
    if (phaseDefs.length === 0) return;
    const ordered = sortPhaseDefsForDisplay(phaseDefs);
    if (!selectedContestStandingPhaseId || !ordered.some(def => def.id === selectedContestStandingPhaseId)) {
      setSelectedContestStandingPhaseId(ordered[0].id);
    }
  }, [phaseDefs, selectedContestStandingPhaseId]);

  // Registration UI Form State
  const [selectedRegType, setSelectedRegType] = useState<'individual' | 'team'>('individual');
  const [selectedEntryMode, setSelectedEntryMode] = useState<'official' | 'virtual' | 'practice'>('official');
  const [showRegFormForce, setShowRegFormForce] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [, setCustomDisplayName] = useState('');
  const [showCreateTeamInline, setShowCreateTeamInline] = useState(false);
  const [inlineTeamName, setInlineTeamName] = useState('');
  const [inlineTeamSlug, setInlineTeamSlug] = useState('');

  // Mutations
  const createTeamMutation = useMutation({
    mutationFn: (payload: { name: string; slug: string }) => api.createTeam(payload),
    onSuccess: (newTeam) => {
      queryClient.invalidateQueries({ queryKey: ['myTeams'] });
      setSelectedTeamId(newTeam.id);
      setShowCreateTeamInline(false);
      setInlineTeamName('');
      setInlineTeamSlug('');
      setCustomDisplayName(newTeam.name);
      setRegisterError(null);
    },
    onError: (err: any) => {
      setRegisterError(err?.response?.data?.message || 'Failed to create team.');
    }
  });

  // Register mutation with full payload
  const registerMutation = useMutation({
    mutationFn: (payload: {
      entry_type: 'individual' | 'team';
      entry_mode: 'official' | 'virtual' | 'practice';
      user_id?: string | null;
      team_id?: string | null;
      display_name: string;
      start_at?: string;
      end_at?: string;
    }) => api.createEntry(contestId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', contestId] });
      setRegisterError(null);
      setShowRegFormForce(false);
    },
    onError: (err: any) => {
      setRegisterError(err?.response?.data?.message || 'Failed to register.');
    },
  });

  const createQaMutation = useMutation({
    mutationFn: (payload: { task_id?: string | null; phase_id?: string | null; question: string }) =>
      api.createClarification(contestId!, payload, userEntries[0]?.id),
    onSuccess: () => {
      setQaQuestion('');
      setQaTaskId('');
      setQaError(null);
      refetchClarifications();
    },
    onError: (err: any) => {
      setQaError(err?.response?.data?.message || 'Failed to submit clarification.');
    },
  });

  const answerQaMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { answer: string; is_public: boolean } }) =>
      api.answerClarification(id, payload),
    onSuccess: () => {
      setAnsweringId(null);
      setQaAnswer('');
      refetchClarifications();
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: (payload: { submission_id?: string | null; contest_entry_id: string; category: string; subject: string; description: string }) =>
      api.createTicket(payload),
    onSuccess: () => {
      setTicketSubject('');
      setTicketDescription('');
      setTicketSuccess('Support ticket submitted successfully!');
      setTicketError(null);
      refetchMyTickets();
      setTimeout(() => setTicketSuccess(null), 3500);
    },
    onError: (err: any) => {
      setTicketError(err?.response?.data?.message || 'Failed to submit support ticket.');
      setTicketSuccess(null);
    },
  });

  if (loadingContest || loadingPhaseDefs || loadingEntries || loadingMyTeams || loadingAnnouncements) {
    return (
      <div className="container flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
        <div className="spinner"></div>
        <p style={{ marginTop: '1rem', color: 'hsl(var(--text-muted))' }}>Loading contest details...</p>
      </div>
    );
  }

  if (contestError || !contest) {
    return (
      <div className="container" style={{ paddingTop: '2rem' }}>
        <div className="alert alert-danger">
          Contest not found or you do not have permission to view it.
        </div>
        <Link to="/" className="btn btn-secondary flex items-center gap-2" style={{ width: 'fit-content' }}>
          <ArrowLeft size={16} /> Back to contests
        </Link>
      </div>
    );
  }

  const handleRegister = () => {
    if (!user) return;
    setRegisterError(null);

    let startAt: string | undefined;
    let endAt: string | undefined;

    if (selectedEntryMode === 'virtual') {
      const start = new Date(contest.start_time).getTime();
      const end = new Date(contest.end_time).getTime();
      const duration = end - start;
      const now = new Date();
      startAt = now.toISOString();
      endAt = new Date(now.getTime() + duration).toISOString();
    }

    if (selectedRegType === 'individual') {
      registerMutation.mutate({
        entry_type: 'individual',
        entry_mode: selectedEntryMode,
        user_id: user.id,
        display_name: user.username || user.full_name,
        start_at: startAt,
        end_at: endAt,
      });
    } else {
      if (!selectedTeamId) {
        setRegisterError('Please select or create a team.');
        return;
      }
      const team = myTeams.find(t => t.id === selectedTeamId);
      registerMutation.mutate({
        entry_type: 'team',
        entry_mode: selectedEntryMode,
        team_id: selectedTeamId,
        display_name: team?.name || 'Team',
        start_at: startAt,
        end_at: endAt,
      });
    }
  };

  const getPhaseStatus = (def: PhaseDef) => {
    // Standard phases open/close check
    const now = new Date();
    const start = new Date(contest.start_time);
    const end = new Date(contest.end_time);

    // If contest hasn't started, phases are locked
    if (now < start) {
      return { status: 'locked', label: 'Locked (Contest hasn\'t started)' };
    }

    // Check if there is a concrete phase for this PhaseDef on the first task
    const concretePhase = firstTaskPhases.find(p => p.contest_phase_def_id === def.id);
    let phaseStart: Date;
    let phaseEnd: Date;

    if (concretePhase) {
      phaseStart = new Date(concretePhase.open_time);
      phaseEnd = new Date(concretePhase.close_time);
    } else {
      // Fallback: 1/4 of total time
      const duration = end.getTime() - start.getTime();
      const phaseIndex = PHASE_DISPLAY_ORDER[def.key] ?? Math.max(0, def.sort_order - 1);
      phaseStart = new Date(start.getTime() + (duration / 4) * phaseIndex);
      phaseEnd = new Date(start.getTime() + (duration / 4) * (phaseIndex + 1));
    }

    if (now < phaseStart) {
      return { status: 'locked', label: `Opens at ${phaseStart.toLocaleString()}` };
    }
    if (now >= phaseStart && now <= phaseEnd) {
      return { status: 'active', label: `Active (Closes at ${phaseEnd.toLocaleString()})` };
    }
    return { status: 'ended', label: `Ended at ${phaseEnd.toLocaleString()}` };
  };

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  };

  const formatDuration = (startValue: string, endValue: string) => {
    const start = new Date(startValue).getTime();
    const end = new Date(endValue).getTime();
    const diffMs = end - start;
    if (!Number.isFinite(diffMs) || diffMs <= 0) return '-';

    const totalMinutes = Math.round(diffMs / (1000 * 60));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0 && hours > 0) return `${days}d ${hours}h`;
    if (days > 0) return `${days}d`;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  };

  const entryPolicyText = (() => {
    switch (contest.entry_policy) {
      case 'individual':
        return 'Individual';
      case 'team':
        return 'Team';
      case 'both':
        return 'Individual & Team';
      default:
        return contest.entry_policy;
    }
  })();

  const officialEntryCount = entries.filter(entry => entry.entry_mode === 'official').length;
  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const userEntryIds = new Set(userEntries.map(entry => entry.id));
  const contestTickets = myTickets.filter(ticket => userEntryIds.has(ticket.contest_entry_id));
  const orderedPhaseDefs = sortPhaseDefsForDisplay(phaseDefs);
  const orderedContestPhaseStandings = orderedPhaseDefs.map(phaseDef => (
    contestPhaseStandings.find(item => item.phaseDef.id === phaseDef.id) ?? { phaseDef, rows: [] }
  ));
  const selectedContestPhaseStanding = orderedContestPhaseStandings.find(item => item.phaseDef.id === selectedContestStandingPhaseId) ?? orderedContestPhaseStandings[0];
  const formatScore = (score: number | string | null | undefined) => {
    if (score === null || score === undefined || score === '') return '-';
    const numericScore = typeof score === 'number' ? score : Number(score);
    if (!Number.isFinite(numericScore)) return '-';
    return Number.isInteger(numericScore) ? String(numericScore) : numericScore.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  };

  const handleQaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQaError(null);
    if (!userEntries[0]) {
      setQaError('You must register for this contest to ask clarifications.');
      return;
    }
    if (!qaQuestion.trim()) {
      setQaError('Question is required.');
      return;
    }
    createQaMutation.mutate({
      task_id: qaTaskId || null,
      phase_id: null,
      question: qaQuestion.trim(),
    });
  };

  const handleAnswerSubmit = (clarificationId: string) => {
    if (!qaAnswer.trim()) return;
    answerQaMutation.mutate({
      id: clarificationId,
      payload: {
        answer: qaAnswer.trim(),
        is_public: isPublicAnswer,
      },
    });
  };

  const handleTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTicketError(null);
    setTicketSuccess(null);
    const entry = userEntries[0];
    if (!entry) {
      setTicketError('You must register for this contest to submit support tickets.');
      return;
    }
    if (!ticketSubject.trim() || !ticketDescription.trim()) {
      setTicketError('Subject and description are required.');
      return;
    }
    createTicketMutation.mutate({
      contest_entry_id: entry.id,
      category: ticketCategory,
      subject: ticketSubject.trim(),
      description: ticketDescription.trim(),
      submission_id: null,
    });
  };

  const phaseRows = orderedPhaseDefs.map((def) => {
    const concretePhase = firstTaskPhases.find(p => p.contest_phase_def_id === def.id);
    const startTime = concretePhase?.open_time ?? contest.start_time;
    const endTime = concretePhase?.close_time ?? contest.end_time;
    const info = getPhaseStatus(def);
    const statusClass = info.status === 'active' ? 'badge-success' : info.status === 'ended' ? 'badge-secondary' : 'badge-info';
    const statusText = info.status === 'active' ? 'Active' : info.status === 'ended' ? 'Ended' : 'Upcoming';
    const canEnter = (isAdmin || isJury) || info.status !== 'locked' || approvedEntries.length > 0;

    return { def, startTime, endTime, statusClass, statusText, canEnter };
  });

  const renderRegistrationForm = () => {
    const registeredModes = userEntries.map(e => e.entry_mode);
    const availableModes = (['official', 'virtual', 'practice'] as const).filter(mode => !registeredModes.includes(mode));

    if (availableModes.length === 0 && isRegistered) {
      return null;
    }

    return (
      <div className="flex flex-col gap-3" style={{ marginTop: isRegistered ? '1rem' : 0 }}>
        {isRegistered && (
          <div className="flex justify-between items-center">
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>New registration</h4>
            <button
              onClick={() => setShowRegFormForce(false)}
              className="text-muted"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex gap-2" style={{ borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.75rem' }}>
          {contest.entry_policy !== 'team' && (
            <button
              type="button"
              onClick={() => {
                setSelectedRegType('individual');
                setCustomDisplayName('');
              }}
              className={`btn ${selectedRegType === 'individual' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
            >
              <User size={14} /> Individual
            </button>
          )}
          {contest.entry_policy !== 'individual' && (
            <button
              type="button"
              onClick={() => {
                setSelectedRegType('team');
                setCustomDisplayName('');
                if (myTeams.length > 0 && !selectedTeamId) {
                  setSelectedTeamId(myTeams[0].id);
                }
              }}
              className={`btn ${selectedRegType === 'team' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
            >
              <Users size={14} /> Team
            </button>
          )}
        </div>

        <div>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>Participation mode</label>
          <select
            className="form-input"
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem', height: 'auto' }}
            value={selectedEntryMode}
            onChange={(e) => setSelectedEntryMode(e.target.value as any)}
          >
            {(availableModes.length > 0 ? availableModes : ['official'] as const).map(m => (
              <option key={m} value={m}>
                {m === 'official' ? 'Official Contest Entry' : m === 'virtual' ? 'Virtual Replay' : 'Practice Mode'}
              </option>
            ))}
          </select>
        </div>

        {selectedRegType === 'team' ? (
          <div className="flex flex-col gap-2">
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Team</label>
            {showCreateTeamInline ? (
              <div className="panel" style={{ padding: '0.75rem', marginBottom: 0, backgroundColor: '#fcfcfc', border: '1px dashed hsl(var(--border))' }}>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                    placeholder="Team name"
                    value={inlineTeamName}
                    onChange={(e) => {
                      setInlineTeamName(e.target.value);
                      setInlineTeamSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                    }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                    placeholder="team-slug"
                    value={inlineTeamSlug}
                    onChange={(e) => setInlineTeamSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  />
                  <div className="flex gap-1 justify-end">
                    <button type="button" onClick={() => setShowCreateTeamInline(false)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (inlineTeamName.trim() && inlineTeamSlug.trim()) {
                          createTeamMutation.mutate({ name: inlineTeamName.trim(), slug: inlineTeamSlug.trim() });
                        }
                      }}
                      className="btn btn-primary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                      disabled={createTeamMutation.isPending}
                    >
                      {createTeamMutation.isPending ? 'Creating...' : 'Create & select'}
                    </button>
                  </div>
                </div>
              </div>
            ) : myTeams.length === 0 ? (
              <button type="button" onClick={() => setShowCreateTeamInline(true)} className="btn btn-secondary" style={{ width: '100%', fontSize: '0.8rem' }}>
                <Plus size={13} /> Create team
              </button>
            ) : (
              <>
                <select
                  className="form-input"
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem', height: 'auto' }}
                  value={selectedTeamId}
                  onChange={(e) => {
                    setSelectedTeamId(e.target.value);
                    const team = myTeams.find(t => t.id === e.target.value);
                    setCustomDisplayName(team ? team.name : '');
                  }}
                >
                  <option value="" disabled>Choose a team</option>
                  {myTeams.map(t => <option key={t.id} value={t.id}>{t.name} (/{t.slug})</option>)}
                </select>
                <button type="button" onClick={() => setShowCreateTeamInline(true)} className="btn btn-secondary" style={{ alignSelf: 'flex-end', padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}>
                  <Plus size={12} /> New team
                </button>
              </>
            )}
          </div>
        ) : null}

        <button
          onClick={handleRegister}
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={registerMutation.isPending || showCreateTeamInline}
        >
          {registerMutation.isPending ? <Loader2 className="spinner" size={16} /> : <ArrowRight size={16} />}
          Confirm registration
        </button>
      </div>
    );
  };

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <Link to="/contests" className="btn btn-secondary flex items-center gap-2" style={{ width: 'fit-content', padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
          <ArrowLeft size={14} /> Back to Contest List
        </Link>
      </div>

      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">{contest.title}</h1>
          </div>
          {(isAdmin || isJury) && (
            <Link to={`/admin/contests/${contest.id}/setup`} className="btn btn-secondary flex items-center gap-2" style={{ padding: '0.4rem 0.8rem' }}>
              <Settings size={16} /> Admin Setup
            </Link>
          )}
        </div>
      </div>

      <div className="panel" style={{ padding: '0.85rem 1rem', marginBottom: '0.9rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem' }}>
          <div className="flex items-center gap-3" style={{ borderRight: '1px solid hsl(var(--border))' }}>
            <CalendarDays size={20} style={{ color: '#0f172a' }} />
            <div><div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Start Time</div><div className="font-mono" style={{ fontSize: '0.82rem' }}>{formatDateTime(contest.start_time)}</div></div>
          </div>
          <div className="flex items-center gap-3" style={{ borderRight: '1px solid hsl(var(--border))' }}>
            <CalendarDays size={20} style={{ color: '#0f172a' }} />
            <div><div style={{ fontWeight: 700, fontSize: '0.85rem' }}>End Time</div><div className="font-mono" style={{ fontSize: '0.82rem' }}>{formatDateTime(contest.end_time)}</div></div>
          </div>
          <div className="flex items-center gap-3" style={{ borderRight: '1px solid hsl(var(--border))' }}>
            <Clock size={20} style={{ color: '#0f172a' }} />
            <div><div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Duration</div><div style={{ fontSize: '0.82rem' }}>{formatDuration(contest.start_time, contest.end_time)}</div></div>
          </div>
          <div className="flex items-center gap-3">
            <Users size={20} style={{ color: '#0f172a' }} />
            <div><div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Registered</div><div className="font-mono" style={{ fontSize: '0.82rem' }}>{officialEntryCount}</div></div>
          </div>
        </div>
      </div>

      <div className="tab-bar" style={{ marginBottom: '0.75rem' }}>
        <button className={`tab-item ${activeContestTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveContestTab('overview')} style={{ background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0 }}>
          Overview
        </button>
        <button className="tab-item" onClick={() => navigate(`/contests/${contest.id}/phases/public_test?tab=problems`)} style={{ background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0 }}>Problems</button>
        <button className={`tab-item ${activeContestTab === 'standings' ? 'active' : ''}`} onClick={() => setActiveContestTab('standings')} style={{ background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0 }}>
          Standings
        </button>
        <button className={`tab-item ${activeContestTab === 'clarifications' ? 'active' : ''}`} onClick={() => setActiveContestTab('clarifications')} style={{ background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0 }}>
          Clarifications
        </button>
        <button className={`tab-item ${activeContestTab === 'tickets' ? 'active' : ''}`} onClick={() => setActiveContestTab('tickets')} style={{ background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0 }}>
          Support Tickets
        </button>
      </div>

      {activeContestTab === 'overview' && (
      <div className="grid-3-1">
        <div>
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
              <ListChecks size={17} /> Contest Phases
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="oj-table">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {phaseRows.map(({ def, startTime, endTime, statusClass, statusText, canEnter }) => (
                    <tr key={def.id}>
                      <td style={{ fontWeight: 600 }}>{getPhaseLabel(def)}</td>
                      <td className="font-mono" style={{ fontSize: '0.82rem' }}>{formatDateTime(startTime)}</td>
                      <td className="font-mono" style={{ fontSize: '0.82rem' }}>{formatDateTime(endTime)}</td>
                      <td><span className={`badge ${statusClass}`}>{statusText}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.8rem', fontSize: '0.78rem' }}
                          disabled={!canEnter}
                          onClick={() => navigate(`/contests/${contest.id}/phases/${def.key}${approvedEntries[0] ? `?mode=${approvedEntries[0].entry_mode}` : ''}`)}
                        >
                          Enter
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Info size={17} /> About This Contest
            </h3>
            <p style={{ margin: 0, color: '#334155', fontSize: '0.9rem', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
              {contest.description || 'No contest description has been provided yet.'}
            </p>
          </div>

          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Volume2 size={17} /> Latest Announcements</h3>
              <Link to="/newsfeed" style={{ fontSize: '0.8rem' }}>View all</Link>
            </div>
            {sortedAnnouncements.length === 0 ? (
              <div style={{ padding: '1rem', color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>No announcements from organizers yet.</div>
            ) : (
              <table className="oj-table">
                <tbody>
                  {sortedAnnouncements.slice(0, 5).map(ann => (
                    <tr key={ann.id}>
                      <td className="font-mono" style={{ width: '120px', color: '#64748b', fontSize: '0.8rem' }}>{formatDate(ann.created_at)}</td>
                      <td style={{ fontWeight: 600 }}>{ann.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {!(isAdmin || isJury) && (
            <div className="panel">
              <h3 style={{ fontSize: '1rem', margin: '0 0 1rem 0', color: isRegistered ? 'hsl(var(--success))' : 'hsl(var(--text-main))', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isRegistered ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                Your Participation
              </h3>

              {registerError && (
                <div className="alert alert-danger flex items-center gap-2" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                  <AlertCircle size={14} />
                  <div>{registerError}</div>
                </div>
              )}

              {!user ? (
                <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>Login to participate</Link>
              ) : (isRegistered && !showRegFormForce) ? (
                <div className="flex flex-col gap-3">
                  {userEntries.map(entry => (
                    <div key={entry.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '0.75rem', backgroundColor: 'hsl(var(--background))' }}>
                      <div className="flex justify-between items-center" style={{ marginBottom: '0.45rem' }}>
                        <strong style={{ textTransform: 'capitalize', fontSize: '0.85rem' }}>{entry.entry_mode} mode</strong>
                        <span className={`badge ${entry.status === 'approved' || entry.status === 'active' || entry.status === 'finished' ? 'badge-success' : 'badge-warning'}`}>{entry.status}</span>
                      </div>
                      <div style={{ color: '#334155', fontSize: '0.8rem' }}>Name: <strong>{entry.display_name}</strong></div>
                      <div style={{ color: '#334155', fontSize: '0.8rem', textTransform: 'capitalize' }}>Type: {entry.entry_type}</div>
                    </div>
                  ))}
                  <button onClick={() => setShowRegFormForce(true)} className="btn btn-secondary" style={{ width: '100%' }}>
                    <Plus size={14} /> Register for another mode
                  </button>
                </div>
              ) : renderRegistrationForm()}
            </div>
          )}

          <div className="panel">
            <h3 style={{ fontSize: '1rem', margin: '0 0 1rem 0' }}>Contest Details</h3>
            <div className="flex flex-col gap-2" style={{ fontSize: '0.82rem', color: '#334155' }}>
              <div><strong>Type:</strong> {entryPolicyText}</div>
              <div><strong>Policy:</strong> {contest.require_approval ? 'Approval required' : 'Open registration'}</div>
              <div><strong>Visibility:</strong> {contest.visibility}</div>
              <div><strong>Status:</strong> {contest.status}</div>
              <div><strong>Max team size:</strong> {contest.max_team_size}</div>
              <div><strong>Registration start:</strong> {formatDateTime(contest.registration_start)}</div>
              <div><strong>Registration end:</strong> {formatDateTime(contest.registration_end)}</div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ fontSize: '1rem', margin: '0 0 0.75rem 0' }}>Resources</h3>
            <div className="flex flex-col gap-2" style={{ fontSize: '0.85rem' }}>
              <button className="btn btn-secondary" onClick={() => navigate(`/contests/${contest.id}/phases/public_test?tab=problems`)} style={{ justifyContent: 'space-between' }}>
                Problems <ArrowRight size={13} />
              </button>
              <button className="btn btn-secondary" onClick={() => navigate(`/contests/${contest.id}/phases/private_test?tab=standings`)} style={{ justifyContent: 'space-between' }}>
                Standings <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeContestTab === 'standings' && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Contest Phase Standings</h3>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                Standings are separated by phase and participation mode. Scores are not combined across phases.
              </p>
            </div>
            <span className="badge badge-secondary">{orderedPhaseDefs.length} phases</span>
          </div>

          {loadingContestStandings ? (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: '240px' }}>
              <div className="spinner"></div>
              <p style={{ marginTop: '1rem', color: 'hsl(var(--text-muted))' }}>Loading contest standings...</p>
            </div>
          ) : orderedPhaseDefs.length === 0 ? (
            <div style={{ padding: '2rem 1rem', color: 'hsl(var(--text-muted))', textAlign: 'center' }}>
              No phases are configured for this contest.
            </div>
          ) : (
            <div>
              <div style={{ borderBottom: '1px solid hsl(var(--border))', padding: '0.75rem 1rem', backgroundColor: 'hsl(var(--background))' }}>
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <div className="flex flex-wrap gap-2">
                    {orderedContestPhaseStandings.map(({ phaseDef, rows }) => {
                      const active = selectedContestPhaseStanding?.phaseDef.id === phaseDef.id;
                      return (
                        <button
                          key={phaseDef.id}
                          type="button"
                          onClick={() => setSelectedContestStandingPhaseId(phaseDef.id)}
                          className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                        >
                          {getPhaseLabel(phaseDef)}
                          <span className={`badge ${active ? 'badge-secondary' : 'badge-info'}`} style={{ marginLeft: '0.35rem', fontSize: '0.65rem' }}>
                            {rows.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--text-muted))' }}>Mode:</span>
                    <div className="flex gap-1" style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '0.15rem', backgroundColor: '#fff' }}>
                      {(['both', 'official', 'virtual', 'practice'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setSelectedContestStandingMode(mode)}
                          className="btn"
                          style={{
                            padding: '0.2rem 0.6rem',
                            fontSize: '0.75rem',
                            textTransform: 'capitalize',
                            border: 'none',
                            backgroundColor: selectedContestStandingMode === mode ? 'hsl(var(--primary))' : 'transparent',
                            color: selectedContestStandingMode === mode ? 'white' : 'hsl(var(--text-main))',
                            boxShadow: 'none'
                          }}
                        >
                          {mode === 'both' ? 'Both' : mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {selectedContestPhaseStanding && (
                <div>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{getPhaseLabel(selectedContestPhaseStanding.phaseDef)}</h4>
                      <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.76rem', color: 'hsl(var(--text-muted))' }}>
                        {selectedContestStandingMode === 'both' ? 'All participation modes' : `${selectedContestStandingMode} mode`} for this phase only.
                      </p>
                    </div>
                    <span className="badge badge-secondary">{selectedContestPhaseStanding.rows.length} entries</span>
                  </div>

                  {selectedContestPhaseStanding.rows.length === 0 ? (
                    <div style={{ padding: '2rem 1rem', color: 'hsl(var(--text-muted))', textAlign: 'center', fontSize: '0.85rem' }}>
                      No standings for this phase yet.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="oj-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ width: '80px' }}>Rank</th>
                            <th>Participant</th>
                            <th style={{ width: '120px' }}>Type</th>
                            <th style={{ width: '140px', textAlign: 'right' }}>Score</th>
                            <th style={{ width: '120px' }}>Runs</th>
                            <th style={{ width: '170px' }}>Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedContestPhaseStanding.rows.map(row => (
                            <tr key={`${selectedContestPhaseStanding.phaseDef.id}-${row.entry_id}`}>
                              <td className="font-mono" style={{ fontWeight: 700 }}>{row.rank}</td>
                              <td>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                  {row.entry_type === 'individual'
                                    ? (row.usernames?.[0] ?? row.display_name)
                                    : row.display_name}
                                </div>
                                {row.entry_type === 'team' && row.usernames && row.usernames.length > 0 && (
                                  <div className="font-mono" style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                                    {row.usernames.join(', ')}
                                  </div>
                                )}
                              </td>
                              <td><span className="badge badge-secondary">{row.entry_type}</span></td>
                              <td className="font-mono" style={{ textAlign: 'right', color: 'hsl(var(--primary))', fontWeight: 800 }}>
                                {formatScore(row.score)}
                              </td>
                              <td className="font-mono">{row.entries_count}</td>
                              <td className="font-mono" style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                {formatDateTime(row.updated_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeContestTab === 'clarifications' && (
        <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div className="panel">
            <h3 style={{ margin: '0 0 1rem 0' }}>Clarification History</h3>
            <div className="flex flex-col gap-4">
              {clarifications.length === 0 ? (
                <p style={{ color: 'hsl(var(--text-muted))', margin: 0 }}>No clarifications requested yet.</p>
              ) : (
                clarifications.map(item => (
                  <div key={item.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '1rem', backgroundColor: '#fdfdfd' }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: '0.65rem' }}>
                      <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                        {item.task_id ? (tasks.find(task => task.id === item.task_id)?.title || 'Task specific') : 'General'}
                      </span>
                      <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <div className="bubble bubble-question" style={{ maxWidth: '100%', marginBottom: '0.75rem' }}>
                      <strong>Q:</strong> {item.question}
                    </div>
                    {item.answer ? (
                      <div className="bubble bubble-answer" style={{ maxWidth: '100%', marginLeft: 'auto' }}>
                        <strong>Jury:</strong> {item.answer}
                      </div>
                    ) : (
                      <div className="text-muted" style={{ fontSize: '0.82rem', fontStyle: 'italic' }}>
                        Pending response from the jury.
                      </div>
                    )}

                    {(isAdmin || isJury) && !item.answer && (
                      <div style={{ marginTop: '1rem', borderTop: '1px solid hsl(var(--border))', paddingTop: '0.75rem' }}>
                        {answeringId === item.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              className="form-input"
                              value={qaAnswer}
                              onChange={(e) => setQaAnswer(e.target.value)}
                              placeholder="Type response here..."
                              style={{ minHeight: '90px', resize: 'vertical' }}
                            />
                            <div className="flex justify-between items-center">
                              <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <input type="checkbox" checked={isPublicAnswer} onChange={(e) => setIsPublicAnswer(e.target.checked)} />
                                Public answer
                              </label>
                              <div className="flex gap-2">
                                <button onClick={() => setAnsweringId(null)} className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>Cancel</button>
                                <button onClick={() => handleAnswerSubmit(item.id)} className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>Send</button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setAnsweringId(item.id)} className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                            Answer question
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {!(isAdmin || isJury) && (
            <div className="panel">
              <h3 style={{ margin: '0 0 1rem 0' }}>Ask Clarification</h3>
              {qaError && <div className="alert alert-danger" style={{ fontSize: '0.8rem' }}>{qaError}</div>}
              <form onSubmit={handleQaSubmit}>
                <div className="form-group">
                  <label className="form-label">Task context</label>
                  <select className="form-input" value={qaTaskId} onChange={(e) => setQaTaskId(e.target.value)}>
                    <option value="">General / None</option>
                    {tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Question *</label>
                  <textarea
                    className="form-input"
                    value={qaQuestion}
                    onChange={(e) => setQaQuestion(e.target.value)}
                    placeholder="Describe your question clearly..."
                    required
                    style={{ height: '130px', resize: 'vertical' }}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={createQaMutation.isPending}>
                  {createQaMutation.isPending ? 'Sending...' : 'Submit Question'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {activeContestTab === 'tickets' && (
        (isAdmin || isJury) ? (
          <div className="panel flex flex-col items-center justify-center text-center" style={{ minHeight: '280px', borderStyle: 'dashed' }}>
            <Settings size={42} style={{ color: 'hsl(var(--warning))', marginBottom: '1rem', opacity: 0.8 }} />
            <h3>Administrative Support Dispatcher</h3>
            <p style={{ color: 'hsl(var(--text-muted))', maxWidth: '500px', margin: '0.5rem auto 1.25rem auto' }}>
              Staff can assign, prioritize, and resolve contestant tickets from the contest admin setup panel.
            </p>
            <Link to={`/admin/contests/${contest.id}/setup`} className="btn btn-primary">
              <Settings size={16} /> Go to Admin Setup
            </Link>
          </div>
        ) : (
          <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
            <div className="panel">
              <h3 style={{ margin: '0 0 1rem 0' }}>Support Ticket History</h3>
              <div className="flex flex-col gap-4">
                {contestTickets.length === 0 ? (
                  <p style={{ color: 'hsl(var(--text-muted))', margin: 0 }}>No support tickets submitted for this contest yet.</p>
                ) : (
                  contestTickets.map(ticket => (
                    <div key={ticket.id} style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', padding: '1rem', backgroundColor: '#fdfdfd' }}>
                      <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
                        <div className="flex items-center gap-2">
                          <span className="badge badge-info" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>{ticket.category}</span>
                          <span className={`badge ${ticket.priority === 'urgent' || ticket.priority === 'high' ? 'badge-danger' : 'badge-secondary'}`} style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>{ticket.priority}</span>
                        </div>
                        <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>{formatDateTime(ticket.created_at)}</span>
                      </div>
                      <h4 style={{ margin: '0.25rem 0', fontSize: '1rem' }}>{ticket.subject}</h4>
                      <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-main))', whiteSpace: 'pre-line', margin: '0.5rem 0' }}>{ticket.description}</p>
                      <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '0.5rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                        <span className={`badge ${ticket.status === 'resolved' ? 'badge-success' : ticket.status === 'rejected' ? 'badge-danger' : ticket.status === 'in_progress' ? 'badge-info' : 'badge-warning'}`} style={{ textTransform: 'uppercase' }}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                        <span className="text-muted">{ticket.assigned_to ? `Assigned: ${ticket.assigned_to}` : 'Awaiting assignment'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel">
              <h3 style={{ margin: '0 0 1rem 0' }}>Submit Ticket</h3>
              {ticketError && <div className="alert alert-danger" style={{ fontSize: '0.8rem', padding: '0.5rem' }}>{ticketError}</div>}
              {ticketSuccess && <div className="alert alert-success" style={{ fontSize: '0.8rem', padding: '0.5rem' }}>{ticketSuccess}</div>}
              <form onSubmit={handleTicketSubmit}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-input" value={ticketCategory} onChange={(e) => setTicketCategory(e.target.value as any)}>
                    <option value="upload">Upload Issue</option>
                    <option value="judge">Judge Issue</option>
                    <option value="score">Scoring Inconsistency</option>
                    <option value="system">General System Bug</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Subject *</label>
                  <input className="form-input" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} required placeholder="Summarize the issue..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <textarea
                    className="form-input"
                    value={ticketDescription}
                    onChange={(e) => setTicketDescription(e.target.value)}
                    required
                    placeholder="Provide precise details, steps, or error messages..."
                    style={{ height: '130px', resize: 'vertical' }}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={createTicketMutation.isPending}>
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
