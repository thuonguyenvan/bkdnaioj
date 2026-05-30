// Spinner atom — indigo spinning circle indicator
import { cn } from '@/lib/cn'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASS = { sm: 'w-4 h-4 border-2', md: 'w-5 h-5 border-2', lg: 'w-8 h-8 border-[3px]' }

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={cn(
        'rounded-full border-outline-variant border-t-primary animate-spin',
        SIZE_CLASS[size],
        className,
      )}
    />
  )
}
