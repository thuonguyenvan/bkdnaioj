// Avatar atom — circular user avatar with initials fallback
// Used in: top navbar (auth state), clarification bubbles, leaderboard
import { cn } from '@/lib/cn'

interface AvatarProps {
  src?: string
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASS = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
}

/** Shows profile image or first 2 initials on indigo bg as fallback */
export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const safeName = (name ?? '').trim()
  const initials = (safeName || 'User')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase()

  if (src) {
    return (
      <img
        src={src}
        alt={safeName || 'User avatar'}
        className={cn('rounded-full object-cover', SIZE_CLASS[size], className)}
      />
    )
  }
  return (
    <div
      className={cn(
        'rounded-full bg-primary-container/30 text-primary flex items-center justify-center font-semibold shrink-0',
        SIZE_CLASS[size],
        className,
      )}
    >
      {initials}
    </div>
  )
}
