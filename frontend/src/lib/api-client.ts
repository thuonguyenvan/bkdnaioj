import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auto inject token if exists
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('olpai_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Type Definitions matching backend structs
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'jury' | 'contestant';
}

export interface Contest {
  id: string;
  slug: string;
  title: string;
  description: string;
  banner_url: string | null;
  status: 'draft' | 'registration_open' | 'running' | 'ended' | 'archived';
  entry_policy: 'individual' | 'team' | 'both';
  registration_start: string | null;
  registration_end: string | null;
  start_time: string;
  end_time: string;
  visibility: 'public' | 'private';
  max_team_size: number;
  require_approval: boolean;
  scale_scores: boolean;
}

export interface PhaseDef {
  id: string;
  contest_id: string;
  key: 'public_test' | 'private_test' | 'final_public' | 'final_private';
  title: string;
  sort_order: number;
}

export interface Task {
  id: string;
  contest_id: string;
  slug: string;
  title: string;
  description: string;
  problem_statement_url: string | null;
  submission_schema: SubmissionSchema;
  assets?: TaskAsset[];
  asset_keys?: string[];
  required_assets?: string[];
  score_label: string;
  higher_is_better: boolean;
  sort_order: number;
}

export interface SubmissionSchema {
  non_final?: {
    description?: string;
    examples?: string[];
    max_files?: number;
  };
  final?: {
    description?: string;
    examples?: string[];
    max_files?: number;
    inference_entrypoint?: string;
  };
  evaluation?: {
    required_assets?: string[];
    description?: string;
  };
  task_assets?: {
    required_assets?: string[];
    description?: string;
  };
}

export interface EvaluationSetAsset {
  id: string;
  evaluation_set_id: string;
  asset_key: string;
  filename: string;
  object_key: string;
  size_bytes: number;
  content_type?: string | null;
  sha256?: string | null;
  created_at: string;
}

export interface TaskAsset {
  id: string;
  task_id: string;
  asset_key: string;
  filename: string;
  object_key: string;
  size_bytes: number;
  content_type?: string | null;
  sha256?: string | null;
  created_at: string;
}

export interface EvaluationSet {
  id: string;
  task_id: string;
  key: 'public' | 'private';
  title: string;
  description?: string | null;
  created_at: string;
  assets?: EvaluationSetAsset[];
  asset_keys?: string[];
  required_assets?: string[];
  has_judge_script: boolean;
  has_ground_truth?: boolean;
  has_inputs?: boolean;
}

export interface Phase {
  id: string;
  task_id: string;
  contest_phase_def_id: string;
  evaluation_set_id: string;
  slug: string;
  title: string;
  description: string | null;
  open_time: string;
  close_time: string;
  judge_key: string;
  submission_limit: number | null;
  leaderboard_mode: 'best' | 'latest';
  allow_official_submit: boolean;
  allow_virtual_submit: boolean;
  allow_practice_submit: boolean;
  display_scores: boolean;
  is_frozen: boolean;
  is_final: boolean;
}

export interface ContestEntry {
  id: string;
  contest_id: string;
  entry_type: 'individual' | 'team';
  entry_mode: 'official' | 'virtual' | 'practice';
  user_id: string | null;
  team_id: string | null;
  display_name: string;
  status: 'pending' | 'approved' | 'disqualified' | 'active' | 'finished';
  registered_by: string;
  start_at?: string | null;
  end_at?: string | null;
}

export interface SubmissionFile {
  id: string;
  submission_id: string;
  original_filename: string;
  storage_path: string;
  file_size: number;
  content_type: string | null;
}

export interface Submission {
  id: string;
  contest_id: string;
  contest_entry_id: string;
  task_id: string;
  phase_id: string;
  submitted_by: string;
  status: 'uploaded' | 'validating' | 'queued' | 'running' | 'done' | 'failed';
  submitted_at: string;
  file_count: number;
  total_size_bytes: number;
  error_message: string | null;
  raw_score: number | null;
  display_score: number | null;
  is_final: boolean;
}

export interface Announcement {
  id: string;
  contest_id: string | null;
  task_id: string | null;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
}

export interface Clarification {
  id: string;
  contest_id: string;
  task_id: string | null;
  phase_id: string | null;
  contest_entry_id: string;
  question: string;
  answer: string | null;
  is_public: boolean;
  status: 'pending' | 'answered' | 'closed';
  asked_by: string;
  answered_by: string | null;
  answered_at: string | null;
  created_at: string;
}

export interface LeaderboardRow {
  rank: number;
  display_name: string;
  score: number;
  raw_score: number;
  entries_count: number;
  is_frozen: boolean;
  is_disqualified: boolean;
  updated_at: string;
  submission_id?: string;
  entry_id: string;
  entry_type: 'individual' | 'team';
  entry_mode: 'official' | 'virtual' | 'practice';
  user_emails: string[];
}

export interface Team {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface TeamMember {
  user_id: string;
  email: string;
  full_name: string;
  role: 'manager' | 'member';
  joined_at: string;
}

export interface EntryMember {
  contest_entry_id: string;
  user_id: string;
  role: string;
  email?: string;
  full_name?: string;
}

export interface Ticket {
  id: string;
  submission_id?: string | null;
  contest_entry_id: string;
  category: 'upload' | 'judge' | 'score' | 'system';
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'rejected';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigned_to?: string | null;
  created_by: string;
  created_at: string;
  resolved_at?: string | null;
}

export interface PublicStatsSummary {
  users: number;
  contests: number;
  tasks: number;
  submissions: number;
}

export interface TaskStats {
  task_id: string;
  solved_entries: number;
  total_submissions: number;
  done_submissions: number;
  success_rate: number;
}

// API methods
export const api = {
  // Auth
  async login(payload: any) {
    const res = await apiClient.post('/auth/login', payload);
    return res.data; // returns { user, token: { access_token, ... } }
  },
  async register(payload: any) {
    const res = await apiClient.post('/auth/register', payload);
    return res.data;
  },
  async getMe() {
    const res = await apiClient.get('/auth/me');
    return res.data as User;
  },

  // Contests
  async getContests() {
    const res = await apiClient.get('/contests');
    return res.data as Contest[];
  },
  async getContest(id: string) {
    const res = await apiClient.get(`/contests/${id}`);
    return res.data as Contest;
  },
  async createContest(payload: any) {
    const res = await apiClient.post('/contests', payload);
    return res.data as Contest;
  },
  async updateContest(id: string, payload: any) {
    const res = await apiClient.patch(`/contests/${id}`, payload);
    return res.data as Contest;
  },
  async publishContest(id: string) {
    const res = await apiClient.post(`/contests/${id}/publish`);
    return res.data;
  },
  async archiveContest(id: string) {
    const res = await apiClient.post(`/contests/${id}/archive`);
    return res.data;
  },
  async deleteContest(id: string) {
    const res = await apiClient.delete(`/contests/${id}`);
    return res.data;
  },

  // Phase Definitions (types of phases, e.g. public_test)
  async getPhaseDefs(contestId: string) {
    const res = await apiClient.get(`/contests/${contestId}/phase-defs`);
    return res.data as PhaseDef[];
  },
  async createPhaseDef(contestId: string, payload: any) {
    const res = await apiClient.post(`/contests/${contestId}/phase-defs`, payload);
    return res.data as PhaseDef;
  },
  async updatePhaseDef(contestId: string, defId: string, payload: any) {
    const res = await apiClient.patch(`/contests/${contestId}/phase-defs/${defId}`, payload);
    return res.data as PhaseDef;
  },
  async deletePhaseDef(contestId: string, defId: string) {
    const res = await apiClient.delete(`/contests/${contestId}/phase-defs/${defId}`);
    return res.data;
  },

  // Tasks
  async getTasks(contestId: string) {
    const res = await apiClient.get(`/contests/${contestId}/tasks`);
    return res.data as Task[];
  },
  async getTask(id: string) {
    const res = await apiClient.get(`/tasks/${id}`);
    return res.data as Task;
  },
  async createTask(contestId: string, payload: any) {
    const res = await apiClient.post(`/contests/${contestId}/tasks`, payload);
    return res.data as Task;
  },
  async updateTask(id: string, payload: any) {
    const res = await apiClient.patch(`/tasks/${id}`, payload);
    return res.data as Task;
  },
  async deleteTask(id: string) {
    const res = await apiClient.delete(`/tasks/${id}`);
    return res.data;
  },

  // Evaluation Sets (Jury assets config)
  async getEvaluationSets(taskId: string) {
    const res = await apiClient.get(`/tasks/${taskId}/evaluation-sets`);
    return res.data as EvaluationSet[];
  },
  async getTaskAssets(taskId: string) {
    const res = await apiClient.get(`/tasks/${taskId}/assets`);
    return res.data as TaskAsset[];
  },
  async initiateTaskAssets(taskId: string, payload: { assets: { asset_key: string, filename: string, content_type: string, size_bytes: number }[] }) {
    const res = await apiClient.post(`/tasks/${taskId}/assets:initiate`, payload);
    return res.data as { uploads: { asset_key: string, filename: string, object_key: string, put_url: string }[] };
  },
  async completeTaskAssets(taskId: string, payload: { assets: { asset_key: string, filename: string, object_key: string, size_bytes: number, content_type: string }[] }) {
    const res = await apiClient.post(`/tasks/${taskId}/assets/complete`, payload);
    return res.data as TaskAsset[];
  },
  async createEvaluationSet(taskId: string, payload: any) {
    const res = await apiClient.post(`/tasks/${taskId}/evaluation-sets`, payload);
    return res.data;
  },
  async initiateAssets(setId: string, payload: { assets: { asset_key: string, filename: string, content_type: string, size_bytes: number }[] }) {
    const res = await apiClient.post(`/evaluation-sets/${setId}/assets:initiate`, payload);
    return res.data as { uploads: { asset_key: string, filename: string, object_key: string, put_url: string }[] };
  },
  async completeAssets(setId: string, payload: { assets: { asset_key: string, filename: string, object_key: string, size_bytes: number, content_type: string }[] }) {
    const res = await apiClient.post(`/evaluation-sets/${setId}/assets/complete`, payload);
    return res.data;
  },

  // Concrete Phases (instantiation of phase definitions for a task)
  async getPhase(id: string) {
    const res = await apiClient.get(`/phases/${id}`);
    return res.data as Phase;
  },
  async getPhasesByTask(taskId: string) {
    const res = await apiClient.get(`/tasks/${taskId}/phases`);
    return res.data as Phase[];
  },
  async createPhase(taskId: string, payload: any) {
    const res = await apiClient.post(`/tasks/${taskId}/phases`, payload);
    return res.data as Phase;
  },
  async updatePhase(id: string, payload: any) {
    const res = await apiClient.patch(`/phases/${id}`, payload);
    return res.data as Phase;
  },
  async deletePhase(id: string) {
    const res = await apiClient.delete(`/phases/${id}`);
    return res.data;
  },
  async freezePhase(id: string) {
    const res = await apiClient.post(`/phases/${id}/freeze`);
    return res.data as Phase;
  },
  async unfreezePhase(id: string) {
    const res = await apiClient.post(`/phases/${id}/unfreeze`);
    return res.data as Phase;
  },

  // Contest Entries
  async createEntry(contestId: string, payload: {
    entry_type: 'individual' | 'team';
    entry_mode: 'official' | 'virtual' | 'practice';
    user_id?: string | null;
    team_id?: string | null;
    display_name: string;
    start_at?: string;
    end_at?: string;
  }) {
    const res = await apiClient.post(`/contests/${contestId}/entries`, payload);
    return res.data as ContestEntry;
  },
  async getEntries(contestId: string) {
    const res = await apiClient.get(`/contests/${contestId}/entries`);
    return res.data as ContestEntry[];
  },
  async getEntry(id: string) {
    const res = await apiClient.get(`/entries/${id}`);
    return res.data as ContestEntry;
  },
  async approveEntry(id: string) {
    const res = await apiClient.post(`/entries/${id}/approve`);
    return res.data;
  },
  async disqualifyEntry(id: string) {
    const res = await apiClient.post(`/entries/${id}/disqualify`);
    return res.data;
  },

  // Submissions & Upload Flow
  async initiateSubmission(entryId: string, payload: { task_id: string; phase_id: string; files: { filename: string, content_type: string, size_bytes: number }[] }) {
    const res = await apiClient.post(`/entries/${entryId}/submissions:initiate`, payload);
    return res.data as { submission_id: string, uploads: { filename: string, object_key: string, put_url: string }[] };
  },
  async completeSubmission(submissionId: string, payload: { files: { filename: string, object_key: string, size_bytes: number, content_type: string }[] }) {
    const res = await apiClient.post(`/submissions/${submissionId}/complete`, payload);
    return res.data as Submission;
  },
  async getSubmission(id: string) {
    const res = await apiClient.get(`/submissions/${id}`);
    return res.data as Submission;
  },
  async getSubmissionsByEntry(entryId: string) {
    const res = await apiClient.get(`/entries/${entryId}/submissions`);
    return res.data as Submission[];
  },
  async markFinalSubmission(id: string) {
    const res = await apiClient.post(`/submissions/${id}/mark-final`);
    return res.data as Submission;
  },

  // Announcements
  async getAnnouncements(contestId: string) {
    const res = await apiClient.get(`/contests/${contestId}/announcements`);
    return res.data as Announcement[];
  },
  async getSystemAnnouncements() {
    const res = await apiClient.get('/announcements');
    return res.data as Announcement[];
  },
  async createAnnouncement(contestId: string, payload: { title: string; content: string; is_pinned: boolean }) {
    const res = await apiClient.post(`/contests/${contestId}/announcements`, payload);
    return res.data as Announcement;
  },
  async createSystemAnnouncement(payload: { title: string; content: string; is_pinned: boolean }) {
    const res = await apiClient.post('/announcements', payload);
    return res.data as Announcement;
  },

  // Clarifications
  async getClarifications(contestId: string) {
    const res = await apiClient.get(`/contests/${contestId}/clarifications`);
    return res.data as Clarification[];
  },
  async createClarification(contestId: string, payload: { task_id?: string | null; phase_id?: string | null; question: string }, entryId?: string) {
    const url = entryId ? `/contests/${contestId}/clarifications?entry_id=${entryId}` : `/contests/${contestId}/clarifications`;
    const res = await apiClient.post(url, payload);
    return res.data as Clarification;
  },
  async answerClarification(clarificationId: string, payload: { answer: string; is_public: boolean }) {
    const res = await apiClient.post(`/clarifications/${clarificationId}/answer`, payload);
    return res.data as Clarification;
  },

  // Leaderboards
  async getTaskPhaseLeaderboard(phaseId: string, entryMode?: string) {
    const url = entryMode ? `/phases/${phaseId}/leaderboard?entry_mode=${entryMode}` : `/phases/${phaseId}/leaderboard`;
    const res = await apiClient.get(url);
    return res.data as LeaderboardRow[];
  },
  async getContestPhaseLeaderboard(contestId: string, defId: string, entryMode?: string) {
    const url = entryMode ? `/contests/${contestId}/phase-defs/${defId}/leaderboard?entry_mode=${entryMode}` : `/contests/${contestId}/phase-defs/${defId}/leaderboard`;
    const res = await apiClient.get(url);
    return res.data as LeaderboardRow[];
  },
  async recomputeTaskPhaseLeaderboard(phaseId: string) {
    const res = await apiClient.post(`/phases/${phaseId}/leaderboard/recompute`);
    return res.data;
  },
  async recomputeContestPhaseLeaderboard(contestId: string, defId: string) {
    const res = await apiClient.post(`/contests/${contestId}/phase-defs/${defId}/leaderboard/recompute`);
    return res.data;
  },

  // Public stats
  async getPublicStatsSummary() {
    const res = await apiClient.get('/stats/summary');
    return res.data as PublicStatsSummary;
  },
  async getTaskStats() {
    const res = await apiClient.get('/stats/tasks');
    return res.data as TaskStats[];
  },

  // Admin stats
  async getAdminStats() {
    const res = await apiClient.get('/admin/stats');
    return res.data;
  },
  async listUsers() {
    const res = await apiClient.get('/admin/users');
    return res.data as User[];
  },
  async updateUserRole(id: string, role: string) {
    const res = await apiClient.patch(`/admin/users/${id}/role`, { role });
    return res.data;
  },

  // Announcements CRUD additions
  async updateAnnouncement(id: string, payload: { title?: string; content?: string; is_pinned?: boolean; is_public?: boolean }) {
    const res = await apiClient.patch(`/announcements/${id}`, payload);
    return res.data as Announcement;
  },
  async deleteAnnouncement(id: string) {
    const res = await apiClient.delete(`/announcements/${id}`);
    return res.data;
  },

  // Teams API
  async getMyTeams() {
    const res = await apiClient.get('/users/me/teams');
    return res.data as Team[];
  },
  async createTeam(payload: { slug: string; name: string }) {
    const res = await apiClient.post('/teams', payload);
    return res.data as Team;
  },
  async getTeam(id: string) {
    const res = await apiClient.get(`/teams/${id}`);
    return res.data as Team;
  },
  async getTeamMembers(id: string) {
    const res = await apiClient.get(`/teams/${id}/members`);
    return res.data as TeamMember[];
  },
  async addTeamMember(id: string, payload: { user_id: string; role: 'manager' | 'member' }) {
    const res = await apiClient.post(`/teams/${id}/members`, payload);
    return res.data;
  },
  async removeTeamMember(teamId: string, userId: string) {
    const res = await apiClient.delete(`/teams/${teamId}/members/${userId}`);
    return res.data;
  },

  // Entry Lineup Members API
  async getEntryMembers(id: string) {
    const res = await apiClient.get(`/entries/${id}/members`);
    return res.data as EntryMember[];
  },
  async addEntryMember(id: string, payload: { user_id: string; role: string }) {
    const res = await apiClient.post(`/entries/${id}/members`, payload);
    return res.data;
  },
  async removeEntryMember(entryId: string, userId: string) {
    const res = await apiClient.delete(`/entries/${entryId}/members/${userId}`);
    return res.data;
  },

  // Tickets API
  async createTicket(payload: { submission_id?: string | null; contest_entry_id: string; category: string; subject: string; description: string }) {
    const res = await apiClient.post('/tickets', payload);
    return res.data as Ticket;
  },
  async listMyTickets() {
    const res = await apiClient.get('/tickets/me');
    return res.data as Ticket[];
  },
  async listAllTickets(params?: { status?: string; limit?: number; offset?: number }) {
    const res = await apiClient.get('/tickets', { params });
    return res.data as Ticket[];
  },
  async updateTicket(id: string, payload: { status?: string; priority?: string; assigned_to?: string | null }) {
    const res = await apiClient.patch(`/tickets/${id}`, payload);
    return res.data as Ticket;
  },
  async resolveTicket(id: string) {
    const res = await apiClient.post(`/tickets/${id}/resolve`);
    return res.data as Ticket;
  },
};
