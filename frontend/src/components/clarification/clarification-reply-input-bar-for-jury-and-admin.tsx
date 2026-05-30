interface ClarificationReplyInputBarProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
}

export function ClarificationReplyInputBarForJuryAndAdmin({
  value,
  onChange,
  onSend,
  disabled = false,
}: ClarificationReplyInputBarProps) {
  return (
    <div className="border-t border-outline-variant p-md bg-surface-container flex gap-sm">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type a reply..."
        className="flex-1 bg-surface-container-lowest border border-outline-variant rounded px-md py-sm text-sm text-on-surface placeholder:text-outline"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="px-md py-sm rounded bg-primary-container text-white text-sm font-semibold disabled:opacity-50"
      >
        Send
      </button>
    </div>
  )
}
