// Button atom — primary/outline/ghost variants matching OLPAI Stitch design
// Primary: solid indigo bg + indigo glow shadow on hover
import { cn } from '@/lib/cn'
import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-sans font-semibold transition-all duration-200 rounded disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary' &&
          'bg-primary-container text-white hover:bg-[#6056e8] hover:shadow-indigo-glow',
        variant === 'outline' &&
          'border border-outline-variant text-on-surface hover:bg-surface-container',
        variant === 'ghost' &&
          'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
        size === 'sm' && 'text-xs px-sm py-xs',
        size === 'md' && 'text-sm px-md py-sm',
        size === 'lg' && 'text-base px-lg py-md',
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
