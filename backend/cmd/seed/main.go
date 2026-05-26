package main

import (
	"context"
	"flag"
	"fmt"
	"math/rand/v2"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mank1/olpai-backend/db"
)

const passwordHash = "$2a$10$6y1QM9ZlnTcbwV3uM8CWzeshpECuI.ZJ3Plh2VIx5uOdkWnLihM1K" // "password"

func main() {
	var (
		reset                = flag.Bool("reset", true, "truncate tables before seeding")
		usersN               = flag.Int("users", 200, "number of contestant users")
		contestsN            = flag.Int("contests", 8, "number of contests")
		tasksPerContest      = flag.Int("tasks-per-contest", 10, "tasks per contest")
		entriesPerContest    = flag.Int("entries-per-contest", 150, "entries per contest")
		submissionsPerEntry  = flag.Int("submissions-per-entry", 8, "submissions per entry")
		announcementsPerCont = flag.Int("announcements-per-contest", 12, "announcements per contest")
	)
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DB_URL")
	}
	if dsn == "" {
		_, _ = os.Stderr.WriteString("missing DATABASE_URL (or DB_URL)\n")
		os.Exit(2)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		_, _ = os.Stderr.WriteString("db connect: " + err.Error() + "\n")
		os.Exit(1)
	}
	defer pool.Close()

	tx, err := pool.Begin(ctx)
	if err != nil {
		_, _ = os.Stderr.WriteString("db begin: " + err.Error() + "\n")
		os.Exit(1)
	}
	defer tx.Rollback(context.Background())

	if *reset {
		if err := truncateAll(ctx, tx); err != nil {
			_, _ = os.Stderr.WriteString("truncate: " + err.Error() + "\n")
			os.Exit(1)
		}
	}

	q := db.New(tx)
	now := time.Now().UTC()

	admin, err := q.CreateUser(ctx, db.CreateUserParams{
		Email:        "admin@local.com",
		PasswordHash: passwordHash,
		FullName:     "Dev Admin",
		Role:         "admin",
		StudentID:    ptrString("AD-001"),
		AvatarUrl:    ptrString("https://api.dicebear.com/7.x/adventurer/svg?seed=admin"),
	})
	if err != nil {
		_, _ = os.Stderr.WriteString("create admin: " + err.Error() + "\n")
		os.Exit(1)
	}

	jury, err := q.CreateUser(ctx, db.CreateUserParams{
		Email:        "jury@local.com",
		PasswordHash: passwordHash,
		FullName:     "Dev Jury",
		Role:         "jury",
		StudentID:    ptrString("JR-002"),
		AvatarUrl:    ptrString("https://api.dicebear.com/7.x/adventurer/svg?seed=jury"),
	})
	if err != nil {
		_, _ = os.Stderr.WriteString("create jury: " + err.Error() + "\n")
		os.Exit(1)
	}

	contestants := make([]db.User, 0, *usersN)
	for i := 1; i <= *usersN; i++ {
		email := fmt.Sprintf("user%04d@local.com", i)
		fullName := fmt.Sprintf("User %04d", i)
		u, err := q.CreateUser(ctx, db.CreateUserParams{
			Email:        email,
			PasswordHash: passwordHash,
			FullName:     fullName,
			Role:         "contestant",
			StudentID:    ptrString(fmt.Sprintf("SV-%04d", i)),
			AvatarUrl:    ptrString(fmt.Sprintf("https://api.dicebear.com/7.x/adventurer/svg?seed=%s", urlSafeSeed(fullName))),
		})
		if err != nil {
			_, _ = os.Stderr.WriteString("create user: " + err.Error() + "\n")
			os.Exit(1)
		}
		contestants = append(contestants, u)
	}

	allTasks := make([]db.Task, 0, *contestsN**tasksPerContest)
	allPhasesByContest := make(map[uuid.UUID]map[db.ContestPhaseKey]db.ContestPhaseDef)
	allTaskPhases := make(map[uuid.UUID]map[db.ContestPhaseKey]db.Phase)

	for ci := 1; ci <= *contestsN; ci++ {
		slug := fmt.Sprintf("demo-contest-%02d", ci)
		title := fmt.Sprintf("Demo Contest %02d", ci)
		desc := "Demo contest seeded for development."

		start := now.Add(time.Duration(-24*ci) * time.Hour)
		end := start.Add(14 * 24 * time.Hour)

		descPtr := ptrString(desc)
		c, err := q.CreateContest(ctx, db.CreateContestParams{
			Slug:              slug,
			Title:             title,
			Description:       descPtr,
			BannerUrl:         nil,
			EntryPolicy:       db.ContestEntryPolicyBoth,
			RegistrationStart: pgtype.Timestamptz{Time: start.Add(-48 * time.Hour), Valid: true},
			RegistrationEnd:   pgtype.Timestamptz{Time: start.Add(48 * time.Hour), Valid: true},
			StartTime:         pgtype.Timestamptz{Time: start, Valid: true},
			EndTime:           pgtype.Timestamptz{Time: end, Valid: true},
			Visibility:        db.ContestVisibilityPublic,
			Column11:          "{}",
			CreatedBy:         pgtype.UUID{Bytes: admin.ID, Valid: true},
			MaxTeamSize:       3,
			RequireApproval:   false,
			ScaleScores:       true,
		})
		if err != nil {
			_, _ = os.Stderr.WriteString("create contest: " + err.Error() + "\n")
			os.Exit(1)
		}

		status := db.ContestStatusRunning
		switch ci % 4 {
		case 1:
			status = db.ContestStatusRunning
		case 2:
			status = db.ContestStatusRegistrationOpen
		case 3:
			status = db.ContestStatusEnded
		case 0:
			status = db.ContestStatusRunning
		}
		_, err = q.UpdateContestStatus(ctx, db.UpdateContestStatusParams{ID: c.ID, Status: status})
		if err != nil {
			_, _ = os.Stderr.WriteString("update contest status: " + err.Error() + "\n")
			os.Exit(1)
		}

		defs := make(map[db.ContestPhaseKey]db.ContestPhaseDef, 4)
		for _, def := range []struct {
			Key       db.ContestPhaseKey
			Title     string
			SortOrder int32
		}{
			{db.ContestPhaseKeyPublicTest, "Public Test", 1},
			{db.ContestPhaseKeyPrivateTest, "Private Test", 2},
			{db.ContestPhaseKeyFinalPublic, "Final Public", 3},
			{db.ContestPhaseKeyFinalPrivate, "Final Private", 4},
		} {
			pd, err := q.CreatePhaseDef(ctx, db.CreatePhaseDefParams{
				ContestID: c.ID,
				Key:       def.Key,
				Title:     fmt.Sprintf("%s — %s", title, def.Title),
				SortOrder: def.SortOrder,
			})
			if err != nil {
				_, _ = os.Stderr.WriteString("create phase def: " + err.Error() + "\n")
				os.Exit(1)
			}
			defs[def.Key] = pd
		}
		allPhasesByContest[c.ID] = defs

		for ti := 1; ti <= *tasksPerContest; ti++ {
			tslug := fmt.Sprintf("task-%02d", ti)
			title := fmt.Sprintf("Task %02d", ti)
			tdesc := fmt.Sprintf("Seeded task %02d for %s", ti, c.Title)
			tdescPtr := ptrString(tdesc)

			task, err := q.CreateTask(ctx, db.CreateTaskParams{
				ContestID:           c.ID,
				Slug:                tslug,
				Title:               title,
				Description:         tdescPtr,
				ProblemStatementUrl: nil,
				Column6:             "{}",
				ScoreLabel:          "Score",
				HigherIsBetter:      true,
				SortOrder:           int32(ti),
			})
			if err != nil {
				_, _ = os.Stderr.WriteString("create task: " + err.Error() + "\n")
				os.Exit(1)
			}
			allTasks = append(allTasks, task)

			pubSet, err := q.CreateEvaluationSet(ctx, db.CreateEvaluationSetParams{
				TaskID:      task.ID,
				Key:         db.EvaluationSetKeyPublic,
				Title:       "Public Evaluation Set",
				Description: nil,
			})
			if err != nil {
				_, _ = os.Stderr.WriteString("create eval set public: " + err.Error() + "\n")
				os.Exit(1)
			}
			privSet, err := q.CreateEvaluationSet(ctx, db.CreateEvaluationSetParams{
				TaskID:      task.ID,
				Key:         db.EvaluationSetKeyPrivate,
				Title:       "Private Evaluation Set",
				Description: nil,
			})
			if err != nil {
				_, _ = os.Stderr.WriteString("create eval set private: " + err.Error() + "\n")
				os.Exit(1)
			}

			for _, set := range []db.TaskEvaluationSet{pubSet, privSet} {
				_, err := q.UpsertEvaluationSetAsset(ctx, db.UpsertEvaluationSetAssetParams{
					EvaluationSetID:  set.ID,
					AssetKey:         "judge.py",
					OriginalFilename: "judge.py",
					StoragePath:      fmt.Sprintf("seed/%s/%s/%s", c.Slug, task.Slug, set.Key),
					FileSize:         1024,
					ContentType:      ptrString("text/x-python"),
					HashSha256:       ptrString("seed"),
				})
				if err != nil {
					_, _ = os.Stderr.WriteString("upsert asset judge: " + err.Error() + "\n")
					os.Exit(1)
				}
				_, err = q.UpsertEvaluationSetAsset(ctx, db.UpsertEvaluationSetAssetParams{
					EvaluationSetID:  set.ID,
					AssetKey:         "ground_truth.csv",
					OriginalFilename: "ground_truth.csv",
					StoragePath:      fmt.Sprintf("seed/%s/%s/%s", c.Slug, task.Slug, set.Key),
					FileSize:         2048,
					ContentType:      ptrString("text/csv"),
					HashSha256:       ptrString("seed"),
				})
				if err != nil {
					_, _ = os.Stderr.WriteString("upsert asset gt: " + err.Error() + "\n")
					os.Exit(1)
				}
			}

			phases := make(map[db.ContestPhaseKey]db.Phase, 4)
			for _, defKey := range []db.ContestPhaseKey{db.ContestPhaseKeyPublicTest, db.ContestPhaseKeyPrivateTest, db.ContestPhaseKeyFinalPublic, db.ContestPhaseKeyFinalPrivate} {
				pd := defs[defKey]

				evalSetID := pubSet.ID
				isFinal := false
				if defKey == db.ContestPhaseKeyPrivateTest || defKey == db.ContestPhaseKeyFinalPrivate {
					evalSetID = privSet.ID
				}
				if defKey == db.ContestPhaseKeyFinalPublic || defKey == db.ContestPhaseKeyFinalPrivate {
					isFinal = true
				}

				ph, err := q.CreatePhase(ctx, db.CreatePhaseParams{
					TaskID:              task.ID,
					ContestPhaseDefID:   pd.ID,
					EvaluationSetID:     evalSetID,
					Slug:                string(defKey),
					Title:               pd.Title,
					Description:         nil,
					OpenTime:            pgtype.Timestamptz{Time: start, Valid: true},
					CloseTime:           pgtype.Timestamptz{Time: end, Valid: true},
					JudgeKey:            "default",
					SubmissionLimit:     nil,
					LeaderboardMode:     db.LeaderboardModeBest,
					AllowOfficialSubmit: true,
					AllowVirtualSubmit:  true,
					AllowPracticeSubmit: true,
					DisplayScores:       true,
					IsFrozen:            false,
					IsFinal:             isFinal,
					SortOrder:           int32(pd.SortOrder),
				})
				if err != nil {
					_, _ = os.Stderr.WriteString("create phase: " + err.Error() + "\n")
					os.Exit(1)
				}
				phases[defKey] = ph
			}
			allTaskPhases[task.ID] = phases
		}

		// announcements
		for ai := 1; ai <= *announcementsPerCont; ai++ {
			pinned := ai%7 == 0
			_, err := q.CreateAnnouncement(ctx, db.CreateAnnouncementParams{
				ContestID: pgtype.UUID{Bytes: c.ID, Valid: true},
				TaskID:    pgtype.UUID{Valid: false},
				Title:     fmt.Sprintf("Announcement %02d", ai),
				Content:   fmt.Sprintf("Update %02d for %s", ai, c.Title),
				IsPinned:  pinned,
				IsPublic:  true,
				CreatedBy: admin.ID,
			})
			if err != nil {
				_, _ = os.Stderr.WriteString("create announcement: " + err.Error() + "\n")
				os.Exit(1)
			}
		}
	}

	// Entries + submissions
	for contestID, defs := range allPhasesByContest {
		_ = defs
		// Shuffle contestants for this contest to select without replacement
		shuffled := make([]db.User, len(contestants))
		copy(shuffled, contestants)
		rand.Shuffle(len(shuffled), func(i, j int) {
			shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
		})

		for ei := 0; ei < *entriesPerContest; ei++ {
			if ei >= len(shuffled) {
				break
			}
			u := shuffled[ei]
			displayName := u.FullName

			entry, err := q.CreateContestEntry(ctx, db.CreateContestEntryParams{
				ContestID:    contestID,
				EntryType:    db.EntryTypeIndividual,
				EntryMode:    db.EntryModeOfficial,
				UserID:       pgtype.UUID{Bytes: u.ID, Valid: true},
				TeamID:       pgtype.UUID{Valid: false},
				DisplayName:  displayName,
				Status:       db.EntryStatusApproved,
				RegisteredBy: u.ID,
				StartAt:      pgtype.Timestamptz{Time: now, Valid: true},
				EndAt:        pgtype.Timestamptz{Valid: false},
			})
			if err != nil {
				_, _ = os.Stderr.WriteString("create entry: " + err.Error() + "\n")
				os.Exit(1)
			}

			err = q.AddEntryMember(ctx, db.AddEntryMemberParams{
				ContestEntryID: entry.ID,
				UserID:         u.ID,
				Role:           db.EntryMemberRoleMember,
			})
			if err != nil {
				_, _ = os.Stderr.WriteString("add entry member: " + err.Error() + "\n")
				os.Exit(1)
			}

			// pick tasks for this contest
			contestTasks := make([]db.Task, 0)
			for _, t := range allTasks {
				if t.ContestID == contestID {
					contestTasks = append(contestTasks, t)
				}
			}
			if len(contestTasks) == 0 {
				continue
			}

			for si := 0; si < *submissionsPerEntry; si++ {
				t := contestTasks[rand.IntN(len(contestTasks))]
				phases := allTaskPhases[t.ID]
				ph := phases[db.ContestPhaseKeyPublicTest]
				if si%6 == 0 {
					ph = phases[db.ContestPhaseKeyPrivateTest]
				}

				sub, err := q.CreateSubmission(ctx, db.CreateSubmissionParams{
					ContestID:      contestID,
					ContestEntryID: entry.ID,
					TaskID:         t.ID,
					PhaseID:        ph.ID,
					SubmittedBy:    u.ID,
					FileCount:      1,
					TotalSizeBytes: 1000,
					ManifestHash:   nil,
					ClientIp:       nil,
					UserAgent:      nil,
				})
				if err != nil {
					_, _ = os.Stderr.WriteString("create submission: " + err.Error() + "\n")
					os.Exit(1)
				}

				_, err = q.CreateSubmissionFile(ctx, db.CreateSubmissionFileParams{
					SubmissionID:     sub.ID,
					OriginalFilename: "predictions.csv",
					StoragePath:      fmt.Sprintf("seed/submissions/%s.csv", sub.ID.String()),
					FileSize:         1000,
					ContentType:      ptrString("text/csv"),
					HashSha256:       ptrString("seed"),
				})
				if err != nil {
					_, _ = os.Stderr.WriteString("create submission file: " + err.Error() + "\n")
					os.Exit(1)
				}

				// Mark done/failed and set scores
				status := "done"
				if rand.IntN(10) == 0 {
					status = "failed"
				}
				score := float64(rand.IntN(5000)) / 100.0
				_, err = tx.Exec(ctx, "UPDATE submissions SET status=$2, raw_score=$3, display_score=$3, evaluated_at=now(), updated_at=now() WHERE id=$1", sub.ID, status, score)
				if err != nil {
					_, _ = os.Stderr.WriteString("update submission status: " + err.Error() + "\n")
					os.Exit(1)
				}
			}
		}
	}

	_ = jury // keep for potential future use

	if err := tx.Commit(ctx); err != nil {
		_, _ = os.Stderr.WriteString("commit: " + err.Error() + "\n")
		os.Exit(1)
	}

	_, _ = os.Stdout.WriteString("seed complete\n")
}

func urlSafeSeed(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, " ", "-")
	if s == "" {
		return "user"
	}
	return s
}

func ptrString(s string) *string { return &s }

func truncateAll(ctx context.Context, tx db.DBTX) error {
	_, err := tx.Exec(ctx, `TRUNCATE TABLE
	  contest_phase_leaderboard_entries,
	  task_phase_leaderboard_entries,
	  clarifications,
	  tickets,
	  announcements,
	  evaluation_jobs,
	  submission_files,
	  submissions,
	  contest_entry_members,
	  contest_entries,
	  phases,
	  evaluation_set_assets,
	  task_evaluation_sets,
	  tasks,
	  contest_phase_defs,
	  contests,
	  team_members,
	  teams,
	  users
	CASCADE`)
	return err
}
