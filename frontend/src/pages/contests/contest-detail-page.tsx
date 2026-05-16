// Contest detail page — header card + tabbed content (overview, tasks, announcements)
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TabBar } from '@/components/ui/tab-bar'
import { contestsApi } from '@/lib/api/contests-api-list-and-get'
import { tasksApi } from '@/lib/api/tasks-api-list-by-contest-and-get'
import { announcementsApi } from '@/lib/api/announcements-api-list-by-contest'
import { ContestHeaderCardWithPhaseProgress } from '@/components/contest/contest-header-card-with-phase-progress'
import { ContestOverviewTabContentWithDescriptionAndSchedule } from '@/components/contest/contest-overview-tab-content-with-description-and-schedule'
import { ContestTasksTabContentWithSubmitActions } from '@/components/contest/contest-tasks-tab-content-with-submit-actions'
import { ContestAnnouncementsTabContentList } from '@/components/contest/contest-announcements-tab-content-list'
import { Button } from '@/components/ui/button'
import type { Announcement, Contest, Task } from '@/types/api-types'

type ContestTab = 'overview' | 'tasks' | 'announcements'

export function ContestDetailPage() {
  const { contestId = '' } = useParams<{ contestId: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ContestTab>('overview')
  const [isJoined, setIsJoined] = useState(false)

  const { data: contest, isLoading: loadingContest } = useQuery<Contest>({
    queryKey: ['contest', contestId],
    queryFn: () => contestsApi.get(contestId),
    enabled: !!contestId,
  })

  const { data: tasks = [], isLoading: loadingTasks } = useQuery<Task[]>({
    queryKey: ['tasks', contestId],
    queryFn: () => tasksApi.listByContest(contestId),
    enabled: !!contestId,
  })

  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ['announcements', contestId],
    queryFn: () => announcementsApi.listByContest(contestId),
    enabled: !!contestId,
  })

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'tasks', label: 'Tasks' },
      { id: 'announcements', label: 'Announcements', badge: announcements.length },
    ],
    [announcements.length],
  )

  async function handleJoin() {
    if (!contestId) return
    await contestsApi.join(contestId)
    setIsJoined(true)
  }

  if (loadingContest || loadingTasks || !contest) {
    return <div className="p-lg text-sm text-on-surface-variant">Loading contest…</div>
  }

  return (
    <div className="p-lg max-w-[1100px] bg-gradient-to-b from-primary-container/5 to-transparent rounded-xl">
      <ContestHeaderCardWithPhaseProgress
        contest={contest}
        taskCount={tasks.length}
        isJoined={isJoined}
        onJoin={handleJoin}
        onOpenLeaderboard={() => navigate(`/contests/${contestId}/leaderboard`)}
      />

      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as ContestTab)}
        className="mb-md"
      />

      {activeTab === 'overview' && (
        <ContestOverviewTabContentWithDescriptionAndSchedule contest={contest} />
      )}

      {activeTab === 'tasks' && (
        <ContestTasksTabContentWithSubmitActions contestId={contestId} tasks={tasks} />
      )}

      {activeTab === 'announcements' && (
        <ContestAnnouncementsTabContentList announcements={announcements} />
      )}

      <div className="mt-lg">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/contests/${contestId}/clarifications`)}
        >
          Go to Clarifications
        </Button>
      </div>
    </div>
  )
}
