// Router — full OLPAI route tree using React Router v6 createBrowserRouter
// Two layout shells: TopNavPublicLayout (top bar) and ContestSidebarLayout (left sidebar)
import { createBrowserRouter } from 'react-router-dom'

import { TopNavPublicLayout }    from '@/layouts/top-nav-public-layout'
import { ContestSidebarLayout }  from '@/layouts/contest-sidebar-layout'
import { AdminSidebarLayout }    from '@/layouts/admin-sidebar-layout'

import { HomePage }              from '@/pages/home-page'
import { LoginPage }             from '@/pages/login-page'
import { RegisterPage }          from '@/pages/register-page'
import { NotFoundPage }          from '@/pages/not-found-page'
import { ContestDetailPage }     from '@/pages/contests/contest-detail-page'
import { SubmissionPage }        from '@/pages/contests/submission-page'
import { LeaderboardPage }       from '@/pages/contests/leaderboard-page'
import { ClarificationsPage }    from '@/pages/contests/clarifications-page'
import { AdminJudgeQueueMonitorPage } from '@/pages/admin/admin-judge-queue-monitor-page'
import { AdminContestSubmissionsPage } from '@/pages/admin/admin-contest-submissions-page'
import { AdminContestParticipantsPage } from '@/pages/admin/admin-contest-participants-page'
import { AdminContestClarificationsPage } from '@/pages/admin/admin-contest-clarifications-page'
import { AdminContestLifecycleSettingsPage } from '@/pages/admin/admin-contest-lifecycle-settings-page'
import { AdminCreateContestFormPage } from '@/pages/admin/admin-create-contest-form-page'

export const router = createBrowserRouter([
  // Public layout — fixed top navbar
  {
    element: <TopNavPublicLayout />,
    children: [
      { path: '/',                                    element: <HomePage /> },
      { path: '/contests/:contestId/leaderboard',     element: <LeaderboardPage /> },
    ],
  },

  // Contest sidebar layout — fixed left sidebar + top navbar
  {
    path: '/contests/:contestId',
    element: <ContestSidebarLayout />,
    children: [
      { index: true,                                  element: <ContestDetailPage /> },
      { path: 'tasks/:taskId/submit',                 element: <SubmissionPage /> },
      { path: 'clarifications',                       element: <ClarificationsPage /> },
    ],
  },

  // Admin layout — role-guarded, left sidebar only
  {
    path: '/admin',
    element: <AdminSidebarLayout />,
    children: [
      { path: 'contests/new',                         element: <AdminCreateContestFormPage /> },
      { path: 'contests/:contestId/judge-queue',      element: <AdminJudgeQueueMonitorPage /> },
      { path: 'contests/:contestId/submissions',      element: <AdminContestSubmissionsPage /> },
      { path: 'contests/:contestId/participants',     element: <AdminContestParticipantsPage /> },
      { path: 'contests/:contestId/clarifications',   element: <AdminContestClarificationsPage /> },
      { path: 'contests/:contestId/settings',         element: <AdminContestLifecycleSettingsPage /> },
    ],
  },

  // Auth pages — no layout shell
  { path: '/login',    element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },

  // 404 fallback
  { path: '*',         element: <NotFoundPage /> },
])
