// ContestSidebarLayout — layout for contest pages (detail, submit, clarifications)
// Fixed sidebar (w-64 left) + TopNavbar + main area offset ml-64 pt-16
import { Outlet, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TopNavbar } from '@/components/navigation/top-navbar'
import { ContestSidebarNav } from '@/components/navigation/contest-sidebar-nav'
import { contestsApi } from '@/lib/api/contests-api-list-and-get'
import { tasksApi } from '@/lib/api/tasks-api-list-by-contest-and-get'
import type { Contest, Task } from '@/types/api-types'

export function ContestSidebarLayout() {
  const { contestId } = useParams<{ contestId: string }>()

  const { data: contest } = useQuery<Contest>({
    queryKey: ['contest', contestId],
    queryFn: () => contestsApi.get(contestId!),
    enabled: !!contestId,
  })

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', contestId],
    queryFn: () => tasksApi.listByContest(contestId!),
    enabled: !!contestId,
  })

  return (
    <div className="min-h-screen bg-background">
      <TopNavbar />
      <ContestSidebarNav
        contestId={contestId ?? ''}
        contestTitle={contest?.title ?? '…'}
        tasks={tasks}
      />
      <main className="ml-64 pt-16 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
