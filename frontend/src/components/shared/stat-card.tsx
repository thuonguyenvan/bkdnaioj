// StatCard molecule — icon + label + value for dashboard/homepage stat sections
// Value uses JetBrains Mono font (cyan color) per OLPAI design system
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

interface StatCardProps {
  icon?: ReactNode
  label: string
  value: string | number
  className?: string
}

export function StatCard({ icon, label, value, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-surface-container border border-outline-variant rounded-lg p-md',
        className,
      )}
    >
      {icon && <div className="text-primary mb-xs text-xl">{icon}</div>}
      <div className="font-mono text-2xl font-semibold text-secondary">{value}</div>
      <div className="text-sm text-on-surface-variant mt-xs">{label}</div>
    </div>
  )
}
