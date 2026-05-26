package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// MockQuerier implements Querier for unit tests.
// Each method delegates to its corresponding Func field if non-nil,
// otherwise returns zero value + nil error.
type MockQuerier struct {
	AddEntryMemberFunc                    func(ctx context.Context, arg AddEntryMemberParams) error
	AddTeamMemberFunc                     func(ctx context.Context, arg AddTeamMemberParams) error
	AnswerClarificationFunc               func(ctx context.Context, arg AnswerClarificationParams) (Clarification, error)
	ApproveContestEntryFunc               func(ctx context.Context, arg ApproveContestEntryParams) (ContestEntry, error)
	CountActiveEntriesFunc                func(ctx context.Context) (int64, error)
	CountContestsFunc                     func(ctx context.Context) (int64, error)
	CountSubmissionsFunc                  func(ctx context.Context) (int64, error)
	CountTasksFunc                        func(ctx context.Context) (int64, error)
	CountUsersFunc                        func(ctx context.Context) (int64, error)
	GetTaskSubmissionStatsFunc            func(ctx context.Context) ([]GetTaskSubmissionStatsRow, error)
	CreateAnnouncementFunc                func(ctx context.Context, arg CreateAnnouncementParams) (Announcement, error)
	CreateClarificationFunc               func(ctx context.Context, arg CreateClarificationParams) (Clarification, error)
	CreateContestFunc                     func(ctx context.Context, arg CreateContestParams) (Contest, error)
	CreateContestEntryFunc                func(ctx context.Context, arg CreateContestEntryParams) (ContestEntry, error)
	CreateEvaluationSetFunc               func(ctx context.Context, arg CreateEvaluationSetParams) (TaskEvaluationSet, error)
	CreatePhaseFunc                       func(ctx context.Context, arg CreatePhaseParams) (Phase, error)
	CreatePhaseDefFunc                    func(ctx context.Context, arg CreatePhaseDefParams) (ContestPhaseDef, error)
	CreateSubmissionFunc                  func(ctx context.Context, arg CreateSubmissionParams) (Submission, error)
	CreateSubmissionFileFunc              func(ctx context.Context, arg CreateSubmissionFileParams) (SubmissionFile, error)
	CreateTaskFunc                        func(ctx context.Context, arg CreateTaskParams) (Task, error)
	CreateTeamFunc                        func(ctx context.Context, arg CreateTeamParams) (Team, error)
	CreateTicketFunc                      func(ctx context.Context, arg CreateTicketParams) (Ticket, error)
	CreateUserFunc                        func(ctx context.Context, arg CreateUserParams) (User, error)
	DeleteAnnouncementFunc                func(ctx context.Context, id uuid.UUID) error
	DeleteContestFunc                     func(ctx context.Context, id uuid.UUID) error
	DeleteContestEntryFunc                func(ctx context.Context, id uuid.UUID) error
	DeletePhaseFunc                       func(ctx context.Context, id uuid.UUID) error
	DeletePhaseDefFunc                    func(ctx context.Context, id uuid.UUID) error
	DeleteSubmissionFilesBySubmissionFunc func(ctx context.Context, submissionID uuid.UUID) error
	DeleteTaskFunc                        func(ctx context.Context, id uuid.UUID) error
	DisqualifyContestEntryFunc            func(ctx context.Context, id uuid.UUID) (ContestEntry, error)
	GetClarificationByIDFunc              func(ctx context.Context, id uuid.UUID) (Clarification, error)
	GetContestByIDFunc                    func(ctx context.Context, id uuid.UUID) (Contest, error)
	GetContestBySlugFunc                  func(ctx context.Context, slug string) (Contest, error)
	GetContestEntryByIDFunc               func(ctx context.Context, id uuid.UUID) (ContestEntry, error)
	GetContestPhaseLeaderboardFunc        func(ctx context.Context, arg GetContestPhaseLeaderboardParams) ([]GetContestPhaseLeaderboardRow, error)
	GetEvaluationSetByIDFunc              func(ctx context.Context, id uuid.UUID) (TaskEvaluationSet, error)
	GetEvaluationSetByTaskAndKeyFunc      func(ctx context.Context, arg GetEvaluationSetByTaskAndKeyParams) (TaskEvaluationSet, error)
	GetPhaseByIDFunc                      func(ctx context.Context, id uuid.UUID) (Phase, error)
	GetPhaseDefByIDFunc                   func(ctx context.Context, id uuid.UUID) (ContestPhaseDef, error)
	GetSubmissionByIDFunc                 func(ctx context.Context, id uuid.UUID) (Submission, error)
	GetTaskByIDFunc                       func(ctx context.Context, id uuid.UUID) (Task, error)
	GetTaskPhaseLeaderboardFunc           func(ctx context.Context, arg GetTaskPhaseLeaderboardParams) ([]GetTaskPhaseLeaderboardRow, error)
	GetTeamByIDFunc                       func(ctx context.Context, id uuid.UUID) (Team, error)
	GetTeamBySlugFunc                     func(ctx context.Context, slug string) (Team, error)
	GetUserByEmailFunc                    func(ctx context.Context, email string) (User, error)
	GetUserByIDFunc                       func(ctx context.Context, id uuid.UUID) (User, error)
	ListAnnouncementsByContestFunc        func(ctx context.Context, contestID pgtype.UUID) ([]Announcement, error)
	ListSystemAnnouncementsFunc           func(ctx context.Context) ([]Announcement, error)
	ListClarificationsByContestFunc       func(ctx context.Context, arg ListClarificationsByContestParams) ([]Clarification, error)
	ListContestEntriesFunc                func(ctx context.Context, arg ListContestEntriesParams) ([]ContestEntry, error)
	ListContestsFunc                      func(ctx context.Context, arg ListContestsParams) ([]Contest, error)
	ListEntryMembersFunc                  func(ctx context.Context, contestEntryID uuid.UUID) ([]ListEntryMembersRow, error)
	ListEvaluationSetAssetsFunc           func(ctx context.Context, evaluationSetID uuid.UUID) ([]EvaluationSetAsset, error)
	ListEvaluationSetsByTaskFunc          func(ctx context.Context, taskID uuid.UUID) ([]TaskEvaluationSet, error)
	ListPhaseDefsByContestFunc            func(ctx context.Context, contestID uuid.UUID) ([]ContestPhaseDef, error)
	ListPhasesByTaskFunc                  func(ctx context.Context, taskID uuid.UUID) ([]Phase, error)
	ListSubmissionFilesBySubmissionFunc   func(ctx context.Context, submissionID uuid.UUID) ([]SubmissionFile, error)
	ListSubmissionsByEntryFunc            func(ctx context.Context, arg ListSubmissionsByEntryParams) ([]Submission, error)
	ListTaskAssetsFunc                    func(ctx context.Context, taskID uuid.UUID) ([]TaskAsset, error)
	ListTasksByContestFunc                func(ctx context.Context, contestID uuid.UUID) ([]Task, error)
	ListTeamMembersFunc                   func(ctx context.Context, teamID uuid.UUID) ([]ListTeamMembersRow, error)
	ListTeamsByUserFunc                   func(ctx context.Context, userID uuid.UUID) ([]Team, error)
	ListTicketsAllFunc                    func(ctx context.Context, arg ListTicketsAllParams) ([]Ticket, error)
	ListTicketsByUserFunc                 func(ctx context.Context, createdBy uuid.UUID) ([]Ticket, error)
	ListUsersAdminFunc                    func(ctx context.Context, arg ListUsersAdminParams) ([]ListUsersAdminRow, error)
	MarkSubmissionFinalFunc               func(ctx context.Context, id uuid.UUID) (Submission, error)
	MarkSubmissionQueuedFunc              func(ctx context.Context, arg MarkSubmissionQueuedParams) (Submission, error)
	RemoveEntryMemberFunc                 func(ctx context.Context, arg RemoveEntryMemberParams) error
	RemoveTeamMemberFunc                  func(ctx context.Context, arg RemoveTeamMemberParams) error
	ResetOtherFinalSubmissionsFunc        func(ctx context.Context, arg ResetOtherFinalSubmissionsParams) error
	ResolveTicketFunc                     func(ctx context.Context, id uuid.UUID) (Ticket, error)
	SetPhaseFrozenFunc                    func(ctx context.Context, arg SetPhaseFrozenParams) (Phase, error)
	TouchUserLastVisitFunc                func(ctx context.Context, id uuid.UUID) error
	UpdateAnnouncementFunc                func(ctx context.Context, arg UpdateAnnouncementParams) (Announcement, error)
	UpdateClarificationStatusFunc         func(ctx context.Context, arg UpdateClarificationStatusParams) (Clarification, error)
	UpdateContestFunc                     func(ctx context.Context, arg UpdateContestParams) (Contest, error)
	UpdateContestEntryStatusFunc          func(ctx context.Context, arg UpdateContestEntryStatusParams) (ContestEntry, error)
	UpdateContestStatusFunc               func(ctx context.Context, arg UpdateContestStatusParams) (Contest, error)
	UpdatePhaseFunc                       func(ctx context.Context, arg UpdatePhaseParams) (Phase, error)
	UpdatePhaseDefFunc                    func(ctx context.Context, arg UpdatePhaseDefParams) (ContestPhaseDef, error)
	UpdateTaskFunc                        func(ctx context.Context, arg UpdateTaskParams) (Task, error)
	UpdateTicketFunc                      func(ctx context.Context, arg UpdateTicketParams) (Ticket, error)
	UpdateUserProfileFunc                 func(ctx context.Context, arg UpdateUserProfileParams) (User, error)
	UpdateUserRoleFunc                    func(ctx context.Context, arg UpdateUserRoleParams) (UpdateUserRoleRow, error)
	UpsertContestPhaseLeaderboardFunc     func(ctx context.Context, arg UpsertContestPhaseLeaderboardParams) (ContestPhaseLeaderboardEntry, error)
	UpsertEvaluationSetAssetFunc          func(ctx context.Context, arg UpsertEvaluationSetAssetParams) (EvaluationSetAsset, error)
	UpsertTaskAssetFunc                   func(ctx context.Context, arg UpsertTaskAssetParams) (TaskAsset, error)
	UpsertTaskPhaseLeaderboardFunc        func(ctx context.Context, arg UpsertTaskPhaseLeaderboardParams) (TaskPhaseLeaderboardEntry, error)
	RecomputeTaskPhaseLeaderboardFunc     func(ctx context.Context, arg RecomputeTaskPhaseLeaderboardParams) error
	RecomputeContestPhaseLeaderboardFunc  func(ctx context.Context, arg RecomputeContestPhaseLeaderboardParams) error
}

var _ Querier = (*MockQuerier)(nil)

func (m *MockQuerier) AddEntryMember(ctx context.Context, arg AddEntryMemberParams) error {
	if m.AddEntryMemberFunc != nil {
		return m.AddEntryMemberFunc(ctx, arg)
	}
	return nil
}

func (m *MockQuerier) AddTeamMember(ctx context.Context, arg AddTeamMemberParams) error {
	if m.AddTeamMemberFunc != nil {
		return m.AddTeamMemberFunc(ctx, arg)
	}
	return nil
}

func (m *MockQuerier) AnswerClarification(ctx context.Context, arg AnswerClarificationParams) (Clarification, error) {
	if m.AnswerClarificationFunc != nil {
		return m.AnswerClarificationFunc(ctx, arg)
	}
	return Clarification{}, nil
}

func (m *MockQuerier) ApproveContestEntry(ctx context.Context, arg ApproveContestEntryParams) (ContestEntry, error) {
	if m.ApproveContestEntryFunc != nil {
		return m.ApproveContestEntryFunc(ctx, arg)
	}
	return ContestEntry{}, nil
}

func (m *MockQuerier) CountActiveEntries(ctx context.Context) (int64, error) {
	if m.CountActiveEntriesFunc != nil {
		return m.CountActiveEntriesFunc(ctx)
	}
	return 0, nil
}

func (m *MockQuerier) CountContests(ctx context.Context) (int64, error) {
	if m.CountContestsFunc != nil {
		return m.CountContestsFunc(ctx)
	}
	return 0, nil
}

func (m *MockQuerier) CountSubmissions(ctx context.Context) (int64, error) {
	if m.CountSubmissionsFunc != nil {
		return m.CountSubmissionsFunc(ctx)
	}
	return 0, nil
}

func (m *MockQuerier) CountTasks(ctx context.Context) (int64, error) {
	if m.CountTasksFunc != nil {
		return m.CountTasksFunc(ctx)
	}
	return 0, nil
}

func (m *MockQuerier) CountUsers(ctx context.Context) (int64, error) {
	if m.CountUsersFunc != nil {
		return m.CountUsersFunc(ctx)
	}
	return 0, nil
}

func (m *MockQuerier) GetTaskSubmissionStats(ctx context.Context) ([]GetTaskSubmissionStatsRow, error) {
	if m.GetTaskSubmissionStatsFunc != nil {
		return m.GetTaskSubmissionStatsFunc(ctx)
	}
	return nil, nil
}

func (m *MockQuerier) CreateAnnouncement(ctx context.Context, arg CreateAnnouncementParams) (Announcement, error) {
	if m.CreateAnnouncementFunc != nil {
		return m.CreateAnnouncementFunc(ctx, arg)
	}
	return Announcement{}, nil
}

func (m *MockQuerier) CreateClarification(ctx context.Context, arg CreateClarificationParams) (Clarification, error) {
	if m.CreateClarificationFunc != nil {
		return m.CreateClarificationFunc(ctx, arg)
	}
	return Clarification{}, nil
}

func (m *MockQuerier) CreateContest(ctx context.Context, arg CreateContestParams) (Contest, error) {
	if m.CreateContestFunc != nil {
		return m.CreateContestFunc(ctx, arg)
	}
	return Contest{}, nil
}

func (m *MockQuerier) CreateContestEntry(ctx context.Context, arg CreateContestEntryParams) (ContestEntry, error) {
	if m.CreateContestEntryFunc != nil {
		return m.CreateContestEntryFunc(ctx, arg)
	}
	return ContestEntry{}, nil
}

func (m *MockQuerier) CreateEvaluationSet(ctx context.Context, arg CreateEvaluationSetParams) (TaskEvaluationSet, error) {
	if m.CreateEvaluationSetFunc != nil {
		return m.CreateEvaluationSetFunc(ctx, arg)
	}
	return TaskEvaluationSet{}, nil
}

func (m *MockQuerier) CreatePhase(ctx context.Context, arg CreatePhaseParams) (Phase, error) {
	if m.CreatePhaseFunc != nil {
		return m.CreatePhaseFunc(ctx, arg)
	}
	return Phase{}, nil
}

func (m *MockQuerier) CreatePhaseDef(ctx context.Context, arg CreatePhaseDefParams) (ContestPhaseDef, error) {
	if m.CreatePhaseDefFunc != nil {
		return m.CreatePhaseDefFunc(ctx, arg)
	}
	return ContestPhaseDef{}, nil
}

func (m *MockQuerier) CreateSubmission(ctx context.Context, arg CreateSubmissionParams) (Submission, error) {
	if m.CreateSubmissionFunc != nil {
		return m.CreateSubmissionFunc(ctx, arg)
	}
	return Submission{}, nil
}

func (m *MockQuerier) CreateSubmissionFile(ctx context.Context, arg CreateSubmissionFileParams) (SubmissionFile, error) {
	if m.CreateSubmissionFileFunc != nil {
		return m.CreateSubmissionFileFunc(ctx, arg)
	}
	return SubmissionFile{}, nil
}

func (m *MockQuerier) CreateTask(ctx context.Context, arg CreateTaskParams) (Task, error) {
	if m.CreateTaskFunc != nil {
		return m.CreateTaskFunc(ctx, arg)
	}
	return Task{}, nil
}

func (m *MockQuerier) CreateTeam(ctx context.Context, arg CreateTeamParams) (Team, error) {
	if m.CreateTeamFunc != nil {
		return m.CreateTeamFunc(ctx, arg)
	}
	return Team{}, nil
}

func (m *MockQuerier) CreateTicket(ctx context.Context, arg CreateTicketParams) (Ticket, error) {
	if m.CreateTicketFunc != nil {
		return m.CreateTicketFunc(ctx, arg)
	}
	return Ticket{}, nil
}

func (m *MockQuerier) CreateUser(ctx context.Context, arg CreateUserParams) (User, error) {
	if m.CreateUserFunc != nil {
		return m.CreateUserFunc(ctx, arg)
	}
	return User{}, nil
}

func (m *MockQuerier) DeleteAnnouncement(ctx context.Context, id uuid.UUID) error {
	if m.DeleteAnnouncementFunc != nil {
		return m.DeleteAnnouncementFunc(ctx, id)
	}
	return nil
}

func (m *MockQuerier) DeleteContest(ctx context.Context, id uuid.UUID) error {
	if m.DeleteContestFunc != nil {
		return m.DeleteContestFunc(ctx, id)
	}
	return nil
}

func (m *MockQuerier) DeleteContestEntry(ctx context.Context, id uuid.UUID) error {
	if m.DeleteContestEntryFunc != nil {
		return m.DeleteContestEntryFunc(ctx, id)
	}
	return nil
}

func (m *MockQuerier) DeletePhase(ctx context.Context, id uuid.UUID) error {
	if m.DeletePhaseFunc != nil {
		return m.DeletePhaseFunc(ctx, id)
	}
	return nil
}

func (m *MockQuerier) DeletePhaseDef(ctx context.Context, id uuid.UUID) error {
	if m.DeletePhaseDefFunc != nil {
		return m.DeletePhaseDefFunc(ctx, id)
	}
	return nil
}

func (m *MockQuerier) DeleteSubmissionFilesBySubmission(ctx context.Context, submissionID uuid.UUID) error {
	if m.DeleteSubmissionFilesBySubmissionFunc != nil {
		return m.DeleteSubmissionFilesBySubmissionFunc(ctx, submissionID)
	}
	return nil
}

func (m *MockQuerier) DeleteTask(ctx context.Context, id uuid.UUID) error {
	if m.DeleteTaskFunc != nil {
		return m.DeleteTaskFunc(ctx, id)
	}
	return nil
}

func (m *MockQuerier) DisqualifyContestEntry(ctx context.Context, id uuid.UUID) (ContestEntry, error) {
	if m.DisqualifyContestEntryFunc != nil {
		return m.DisqualifyContestEntryFunc(ctx, id)
	}
	return ContestEntry{}, nil
}

func (m *MockQuerier) GetClarificationByID(ctx context.Context, id uuid.UUID) (Clarification, error) {
	if m.GetClarificationByIDFunc != nil {
		return m.GetClarificationByIDFunc(ctx, id)
	}
	return Clarification{}, nil
}

func (m *MockQuerier) GetContestByID(ctx context.Context, id uuid.UUID) (Contest, error) {
	if m.GetContestByIDFunc != nil {
		return m.GetContestByIDFunc(ctx, id)
	}
	return Contest{}, nil
}

func (m *MockQuerier) GetContestBySlug(ctx context.Context, slug string) (Contest, error) {
	if m.GetContestBySlugFunc != nil {
		return m.GetContestBySlugFunc(ctx, slug)
	}
	return Contest{}, nil
}

func (m *MockQuerier) GetContestEntryByID(ctx context.Context, id uuid.UUID) (ContestEntry, error) {
	if m.GetContestEntryByIDFunc != nil {
		return m.GetContestEntryByIDFunc(ctx, id)
	}
	return ContestEntry{}, nil
}

func (m *MockQuerier) GetContestPhaseLeaderboard(ctx context.Context, arg GetContestPhaseLeaderboardParams) ([]GetContestPhaseLeaderboardRow, error) {
	if m.GetContestPhaseLeaderboardFunc != nil {
		return m.GetContestPhaseLeaderboardFunc(ctx, arg)
	}
	return nil, nil
}

func (m *MockQuerier) GetEvaluationSetByID(ctx context.Context, id uuid.UUID) (TaskEvaluationSet, error) {
	if m.GetEvaluationSetByIDFunc != nil {
		return m.GetEvaluationSetByIDFunc(ctx, id)
	}
	return TaskEvaluationSet{}, nil
}

func (m *MockQuerier) GetEvaluationSetByTaskAndKey(ctx context.Context, arg GetEvaluationSetByTaskAndKeyParams) (TaskEvaluationSet, error) {
	if m.GetEvaluationSetByTaskAndKeyFunc != nil {
		return m.GetEvaluationSetByTaskAndKeyFunc(ctx, arg)
	}
	return TaskEvaluationSet{}, nil
}

func (m *MockQuerier) GetPhaseByID(ctx context.Context, id uuid.UUID) (Phase, error) {
	if m.GetPhaseByIDFunc != nil {
		return m.GetPhaseByIDFunc(ctx, id)
	}
	return Phase{}, nil
}

func (m *MockQuerier) GetPhaseDefByID(ctx context.Context, id uuid.UUID) (ContestPhaseDef, error) {
	if m.GetPhaseDefByIDFunc != nil {
		return m.GetPhaseDefByIDFunc(ctx, id)
	}
	return ContestPhaseDef{}, nil
}

func (m *MockQuerier) GetSubmissionByID(ctx context.Context, id uuid.UUID) (Submission, error) {
	if m.GetSubmissionByIDFunc != nil {
		return m.GetSubmissionByIDFunc(ctx, id)
	}
	return Submission{}, nil
}

func (m *MockQuerier) GetTaskByID(ctx context.Context, id uuid.UUID) (Task, error) {
	if m.GetTaskByIDFunc != nil {
		return m.GetTaskByIDFunc(ctx, id)
	}
	return Task{}, nil
}

func (m *MockQuerier) GetTaskPhaseLeaderboard(ctx context.Context, arg GetTaskPhaseLeaderboardParams) ([]GetTaskPhaseLeaderboardRow, error) {
	if m.GetTaskPhaseLeaderboardFunc != nil {
		return m.GetTaskPhaseLeaderboardFunc(ctx, arg)
	}
	return nil, nil
}

func (m *MockQuerier) GetTeamByID(ctx context.Context, id uuid.UUID) (Team, error) {
	if m.GetTeamByIDFunc != nil {
		return m.GetTeamByIDFunc(ctx, id)
	}
	return Team{}, nil
}

func (m *MockQuerier) GetTeamBySlug(ctx context.Context, slug string) (Team, error) {
	if m.GetTeamBySlugFunc != nil {
		return m.GetTeamBySlugFunc(ctx, slug)
	}
	return Team{}, nil
}

func (m *MockQuerier) GetUserByEmail(ctx context.Context, email string) (User, error) {
	if m.GetUserByEmailFunc != nil {
		return m.GetUserByEmailFunc(ctx, email)
	}
	return User{}, nil
}

func (m *MockQuerier) GetUserByID(ctx context.Context, id uuid.UUID) (User, error) {
	if m.GetUserByIDFunc != nil {
		return m.GetUserByIDFunc(ctx, id)
	}
	return User{}, nil
}

func (m *MockQuerier) ListAnnouncementsByContest(ctx context.Context, contestID pgtype.UUID) ([]Announcement, error) {
	if m.ListAnnouncementsByContestFunc != nil {
		return m.ListAnnouncementsByContestFunc(ctx, contestID)
	}
	return nil, nil
}

func (m *MockQuerier) ListSystemAnnouncements(ctx context.Context) ([]Announcement, error) {
	if m.ListSystemAnnouncementsFunc != nil {
		return m.ListSystemAnnouncementsFunc(ctx)
	}
	return nil, nil
}

func (m *MockQuerier) ListClarificationsByContest(ctx context.Context, arg ListClarificationsByContestParams) ([]Clarification, error) {
	if m.ListClarificationsByContestFunc != nil {
		return m.ListClarificationsByContestFunc(ctx, arg)
	}
	return nil, nil
}

func (m *MockQuerier) ListContestEntries(ctx context.Context, arg ListContestEntriesParams) ([]ContestEntry, error) {
	if m.ListContestEntriesFunc != nil {
		return m.ListContestEntriesFunc(ctx, arg)
	}
	return nil, nil
}

func (m *MockQuerier) ListContests(ctx context.Context, arg ListContestsParams) ([]Contest, error) {
	if m.ListContestsFunc != nil {
		return m.ListContestsFunc(ctx, arg)
	}
	return nil, nil
}

func (m *MockQuerier) ListEntryMembers(ctx context.Context, contestEntryID uuid.UUID) ([]ListEntryMembersRow, error) {
	if m.ListEntryMembersFunc != nil {
		return m.ListEntryMembersFunc(ctx, contestEntryID)
	}
	return nil, nil
}

func (m *MockQuerier) ListEvaluationSetAssets(ctx context.Context, evaluationSetID uuid.UUID) ([]EvaluationSetAsset, error) {
	if m.ListEvaluationSetAssetsFunc != nil {
		return m.ListEvaluationSetAssetsFunc(ctx, evaluationSetID)
	}
	return nil, nil
}

func (m *MockQuerier) ListEvaluationSetsByTask(ctx context.Context, taskID uuid.UUID) ([]TaskEvaluationSet, error) {
	if m.ListEvaluationSetsByTaskFunc != nil {
		return m.ListEvaluationSetsByTaskFunc(ctx, taskID)
	}
	return nil, nil
}

func (m *MockQuerier) ListPhaseDefsByContest(ctx context.Context, contestID uuid.UUID) ([]ContestPhaseDef, error) {
	if m.ListPhaseDefsByContestFunc != nil {
		return m.ListPhaseDefsByContestFunc(ctx, contestID)
	}
	return nil, nil
}

func (m *MockQuerier) ListPhasesByTask(ctx context.Context, taskID uuid.UUID) ([]Phase, error) {
	if m.ListPhasesByTaskFunc != nil {
		return m.ListPhasesByTaskFunc(ctx, taskID)
	}
	return nil, nil
}

func (m *MockQuerier) ListSubmissionFilesBySubmission(ctx context.Context, submissionID uuid.UUID) ([]SubmissionFile, error) {
	if m.ListSubmissionFilesBySubmissionFunc != nil {
		return m.ListSubmissionFilesBySubmissionFunc(ctx, submissionID)
	}
	return nil, nil
}

func (m *MockQuerier) ListSubmissionsByEntry(ctx context.Context, arg ListSubmissionsByEntryParams) ([]Submission, error) {
	if m.ListSubmissionsByEntryFunc != nil {
		return m.ListSubmissionsByEntryFunc(ctx, arg)
	}
	return nil, nil
}

func (m *MockQuerier) ListTaskAssets(ctx context.Context, taskID uuid.UUID) ([]TaskAsset, error) {
	if m.ListTaskAssetsFunc != nil {
		return m.ListTaskAssetsFunc(ctx, taskID)
	}
	return nil, nil
}

func (m *MockQuerier) ListTasksByContest(ctx context.Context, contestID uuid.UUID) ([]Task, error) {
	if m.ListTasksByContestFunc != nil {
		return m.ListTasksByContestFunc(ctx, contestID)
	}
	return nil, nil
}

func (m *MockQuerier) ListTeamMembers(ctx context.Context, teamID uuid.UUID) ([]ListTeamMembersRow, error) {
	if m.ListTeamMembersFunc != nil {
		return m.ListTeamMembersFunc(ctx, teamID)
	}
	return nil, nil
}

func (m *MockQuerier) ListTeamsByUser(ctx context.Context, userID uuid.UUID) ([]Team, error) {
	if m.ListTeamsByUserFunc != nil {
		return m.ListTeamsByUserFunc(ctx, userID)
	}
	return nil, nil
}

func (m *MockQuerier) ListTicketsAll(ctx context.Context, arg ListTicketsAllParams) ([]Ticket, error) {
	if m.ListTicketsAllFunc != nil {
		return m.ListTicketsAllFunc(ctx, arg)
	}
	return nil, nil
}

func (m *MockQuerier) ListTicketsByUser(ctx context.Context, createdBy uuid.UUID) ([]Ticket, error) {
	if m.ListTicketsByUserFunc != nil {
		return m.ListTicketsByUserFunc(ctx, createdBy)
	}
	return nil, nil
}

func (m *MockQuerier) ListUsersAdmin(ctx context.Context, arg ListUsersAdminParams) ([]ListUsersAdminRow, error) {
	if m.ListUsersAdminFunc != nil {
		return m.ListUsersAdminFunc(ctx, arg)
	}
	return nil, nil
}

func (m *MockQuerier) MarkSubmissionFinal(ctx context.Context, id uuid.UUID) (Submission, error) {
	if m.MarkSubmissionFinalFunc != nil {
		return m.MarkSubmissionFinalFunc(ctx, id)
	}
	return Submission{}, nil
}

func (m *MockQuerier) MarkSubmissionQueued(ctx context.Context, arg MarkSubmissionQueuedParams) (Submission, error) {
	if m.MarkSubmissionQueuedFunc != nil {
		return m.MarkSubmissionQueuedFunc(ctx, arg)
	}
	return Submission{}, nil
}

func (m *MockQuerier) RemoveEntryMember(ctx context.Context, arg RemoveEntryMemberParams) error {
	if m.RemoveEntryMemberFunc != nil {
		return m.RemoveEntryMemberFunc(ctx, arg)
	}
	return nil
}

func (m *MockQuerier) RemoveTeamMember(ctx context.Context, arg RemoveTeamMemberParams) error {
	if m.RemoveTeamMemberFunc != nil {
		return m.RemoveTeamMemberFunc(ctx, arg)
	}
	return nil
}

func (m *MockQuerier) ResetOtherFinalSubmissions(ctx context.Context, arg ResetOtherFinalSubmissionsParams) error {
	if m.ResetOtherFinalSubmissionsFunc != nil {
		return m.ResetOtherFinalSubmissionsFunc(ctx, arg)
	}
	return nil
}

func (m *MockQuerier) ResolveTicket(ctx context.Context, id uuid.UUID) (Ticket, error) {
	if m.ResolveTicketFunc != nil {
		return m.ResolveTicketFunc(ctx, id)
	}
	return Ticket{}, nil
}

func (m *MockQuerier) SetPhaseFrozen(ctx context.Context, arg SetPhaseFrozenParams) (Phase, error) {
	if m.SetPhaseFrozenFunc != nil {
		return m.SetPhaseFrozenFunc(ctx, arg)
	}
	return Phase{}, nil
}

func (m *MockQuerier) TouchUserLastVisit(ctx context.Context, id uuid.UUID) error {
	if m.TouchUserLastVisitFunc != nil {
		return m.TouchUserLastVisitFunc(ctx, id)
	}
	return nil
}

func (m *MockQuerier) UpdateAnnouncement(ctx context.Context, arg UpdateAnnouncementParams) (Announcement, error) {
	if m.UpdateAnnouncementFunc != nil {
		return m.UpdateAnnouncementFunc(ctx, arg)
	}
	return Announcement{}, nil
}

func (m *MockQuerier) UpdateClarificationStatus(ctx context.Context, arg UpdateClarificationStatusParams) (Clarification, error) {
	if m.UpdateClarificationStatusFunc != nil {
		return m.UpdateClarificationStatusFunc(ctx, arg)
	}
	return Clarification{}, nil
}

func (m *MockQuerier) UpdateContest(ctx context.Context, arg UpdateContestParams) (Contest, error) {
	if m.UpdateContestFunc != nil {
		return m.UpdateContestFunc(ctx, arg)
	}
	return Contest{}, nil
}

func (m *MockQuerier) UpdateContestEntryStatus(ctx context.Context, arg UpdateContestEntryStatusParams) (ContestEntry, error) {
	if m.UpdateContestEntryStatusFunc != nil {
		return m.UpdateContestEntryStatusFunc(ctx, arg)
	}
	return ContestEntry{}, nil
}

func (m *MockQuerier) UpdateContestStatus(ctx context.Context, arg UpdateContestStatusParams) (Contest, error) {
	if m.UpdateContestStatusFunc != nil {
		return m.UpdateContestStatusFunc(ctx, arg)
	}
	return Contest{}, nil
}

func (m *MockQuerier) UpdatePhase(ctx context.Context, arg UpdatePhaseParams) (Phase, error) {
	if m.UpdatePhaseFunc != nil {
		return m.UpdatePhaseFunc(ctx, arg)
	}
	return Phase{}, nil
}

func (m *MockQuerier) UpdatePhaseDef(ctx context.Context, arg UpdatePhaseDefParams) (ContestPhaseDef, error) {
	if m.UpdatePhaseDefFunc != nil {
		return m.UpdatePhaseDefFunc(ctx, arg)
	}
	return ContestPhaseDef{}, nil
}

func (m *MockQuerier) UpdateTask(ctx context.Context, arg UpdateTaskParams) (Task, error) {
	if m.UpdateTaskFunc != nil {
		return m.UpdateTaskFunc(ctx, arg)
	}
	return Task{}, nil
}

func (m *MockQuerier) UpdateTicket(ctx context.Context, arg UpdateTicketParams) (Ticket, error) {
	if m.UpdateTicketFunc != nil {
		return m.UpdateTicketFunc(ctx, arg)
	}
	return Ticket{}, nil
}

func (m *MockQuerier) UpdateUserProfile(ctx context.Context, arg UpdateUserProfileParams) (User, error) {
	if m.UpdateUserProfileFunc != nil {
		return m.UpdateUserProfileFunc(ctx, arg)
	}
	return User{}, nil
}

func (m *MockQuerier) UpdateUserRole(ctx context.Context, arg UpdateUserRoleParams) (UpdateUserRoleRow, error) {
	if m.UpdateUserRoleFunc != nil {
		return m.UpdateUserRoleFunc(ctx, arg)
	}
	return UpdateUserRoleRow{}, nil
}

func (m *MockQuerier) UpsertContestPhaseLeaderboard(ctx context.Context, arg UpsertContestPhaseLeaderboardParams) (ContestPhaseLeaderboardEntry, error) {
	if m.UpsertContestPhaseLeaderboardFunc != nil {
		return m.UpsertContestPhaseLeaderboardFunc(ctx, arg)
	}
	return ContestPhaseLeaderboardEntry{}, nil
}

func (m *MockQuerier) UpsertEvaluationSetAsset(ctx context.Context, arg UpsertEvaluationSetAssetParams) (EvaluationSetAsset, error) {
	if m.UpsertEvaluationSetAssetFunc != nil {
		return m.UpsertEvaluationSetAssetFunc(ctx, arg)
	}
	return EvaluationSetAsset{}, nil
}

func (m *MockQuerier) UpsertTaskAsset(ctx context.Context, arg UpsertTaskAssetParams) (TaskAsset, error) {
	if m.UpsertTaskAssetFunc != nil {
		return m.UpsertTaskAssetFunc(ctx, arg)
	}
	return TaskAsset{}, nil
}

func (m *MockQuerier) UpsertTaskPhaseLeaderboard(ctx context.Context, arg UpsertTaskPhaseLeaderboardParams) (TaskPhaseLeaderboardEntry, error) {
	if m.UpsertTaskPhaseLeaderboardFunc != nil {
		return m.UpsertTaskPhaseLeaderboardFunc(ctx, arg)
	}
	return TaskPhaseLeaderboardEntry{}, nil
}

func (m *MockQuerier) RecomputeTaskPhaseLeaderboard(ctx context.Context, arg RecomputeTaskPhaseLeaderboardParams) error {
	if m.RecomputeTaskPhaseLeaderboardFunc != nil {
		return m.RecomputeTaskPhaseLeaderboardFunc(ctx, arg)
	}
	return nil
}

func (m *MockQuerier) RecomputeContestPhaseLeaderboard(ctx context.Context, arg RecomputeContestPhaseLeaderboardParams) error {
	if m.RecomputeContestPhaseLeaderboardFunc != nil {
		return m.RecomputeContestPhaseLeaderboardFunc(ctx, arg)
	}
	return nil
}
