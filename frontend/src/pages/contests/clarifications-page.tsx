import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { tasksApi } from '@/lib/api/tasks-api-list-by-contest-and-get'
import {
  useClarifications,
  useCreateClarification,
  useReplyClarification,
} from '@/hooks/use-clarifications-query-and-mutations'
import { ClarificationThreadListPanelWithUnreadIndicators } from '@/components/clarification/clarification-thread-list-panel-with-unread-indicators'
import { ClarificationMessageThreadViewWithBubbles } from '@/components/clarification/clarification-message-thread-view-with-bubbles'
import { ClarificationReplyInputBarForJuryAndAdmin } from '@/components/clarification/clarification-reply-input-bar-for-jury-and-admin'
import { ClarificationNewThreadModalWithTaskSelector } from '@/components/clarification/clarification-new-thread-modal-with-task-selector'
import type { Task } from '@/types/api-types'

export function ClarificationsPage() {
  const { contestId = '' } = useParams<{ contestId: string }>()
  const { user, isJury, isAdmin } = useAuth()

  const { data: threads = [] } = useClarifications(contestId)
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', contestId],
    queryFn: () => tasksApi.listByContest(contestId),
    enabled: !!contestId,
  })

  const createMutation = useCreateClarification(contestId)
  const replyMutation = useReplyClarification(contestId)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [taskId, setTaskId] = useState('')

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) ?? threads[0] ?? null,
    [threads, activeId],
  )

  async function handleCreateThread() {
    if (!contestId) return
    await createMutation.mutateAsync({
      contest_id: contestId,
      task_id: taskId || undefined,
      subject,
      body,
    })
    setSubject('')
    setBody('')
    setTaskId('')
    setShowNewModal(false)
  }

  async function handleReply() {
    if (!activeThread || !reply.trim()) return
    await replyMutation.mutateAsync({
      clarificationId: activeThread.id,
      payload: { body: reply },
    })
    setReply('')
  }

  const canReply = isJury || isAdmin

  return (
    <div className="p-lg h-[calc(100vh-64px)] bg-gradient-to-b from-primary-container/5 to-transparent rounded-xl">
      <div className="h-full border border-outline-variant rounded-lg overflow-hidden bg-background flex flex-col md:flex-row shadow-[0_0_12px_rgba(79,70,229,0.08)]">
        <ClarificationThreadListPanelWithUnreadIndicators
          threads={threads}
          activeId={activeThread?.id ?? null}
          onSelect={setActiveId}
          onNewQuestion={() => setShowNewModal(true)}
        />

        <div className="flex-1 min-h-0 flex flex-col">
          <ClarificationMessageThreadViewWithBubbles thread={activeThread} />
          {canReply ? (
            <ClarificationReplyInputBarForJuryAndAdmin
              value={reply}
              onChange={setReply}
              onSend={handleReply}
              disabled={replyMutation.isPending}
            />
          ) : (
            <div className="border-t border-outline-variant p-md text-xs text-on-surface-variant">
              Signed in as {user?.full_name || user?.email}. Awaiting jury response.
            </div>
          )}
        </div>
      </div>

      <ClarificationNewThreadModalWithTaskSelector
        open={showNewModal}
        subject={subject}
        body={body}
        taskId={taskId}
        tasks={tasks}
        onSubjectChange={setSubject}
        onBodyChange={setBody}
        onTaskChange={setTaskId}
        onClose={() => setShowNewModal(false)}
        onSubmit={handleCreateThread}
        isSubmitting={createMutation.isPending}
      />
    </div>
  )
}
