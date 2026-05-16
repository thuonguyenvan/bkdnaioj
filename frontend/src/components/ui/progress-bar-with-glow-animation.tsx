// ProgressBar atom — 4px track with glowing fill
// Pulses with cyan glow when isRunning=true (judge pipeline active state)
import { cn } from '@/lib/cn'

interface ProgressBarProps {
  value: number     // 0–100
  isRunning?: boolean
  className?: string
}

export function ProgressBar({ value, isRunning = false, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('h-1 w-full bg-surface-container-high rounded-full overflow-hidden', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all duration-500',
          isRunning
            ? 'bg-secondary shadow-[0_0_8px_rgba(76,215,246,0.6)] animate-pulse'
            : 'bg-primary-container shadow-[0_0_8px_rgba(79,70,229,0.4)]',
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
