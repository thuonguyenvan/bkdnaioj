import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

interface AdminLogStreamViewerWithFollowTailToggleProps {
  lines: string[]
  followTail: boolean
  onToggleFollowTail: () => void
}

function lineColor(line: string) {
  if (line.includes('ACCEPTED')) return 'text-green-400'
  if (line.includes('ERROR')) return 'text-error'
  if (line.includes('RUNNING')) return 'text-secondary'
  return 'text-on-surface-variant'
}

export function AdminLogStreamViewerWithFollowTailToggle({
  lines,
  followTail,
  onToggleFollowTail,
}: AdminLogStreamViewerWithFollowTailToggleProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!followTail || !ref.current) return
    ref.current.scrollTop = ref.current.scrollHeight
  }, [followTail, lines])

  return (
    <div className="bg-surface-container border border-outline-variant rounded-lg">
      <div className="p-sm border-b border-outline-variant flex justify-between items-center">
        <p className="text-sm font-semibold text-on-surface">Log Stream</p>
        <button type="button" onClick={onToggleFollowTail} className="text-xs text-on-surface-variant">
          Follow Tail: {followTail ? 'On' : 'Off'}
        </button>
      </div>
      <div ref={ref} className="max-h-[260px] overflow-y-auto p-sm font-mono text-xs space-y-1 bg-surface-container-lowest/50">
        {lines.map((line, idx) => (
          <p key={idx} className={cn('leading-relaxed', lineColor(line))}>{line}</p>
        ))}
        {lines.length === 0 && <p className="text-on-surface-variant">No logs yet.</p>}
      </div>
    </div>
  )
}
