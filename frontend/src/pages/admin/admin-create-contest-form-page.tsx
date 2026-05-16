import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { contestsApi, type CreateContestPayload } from '@/lib/api/contests-api-list-and-get'

interface FormState {
  slug: string
  title: string
  start_time: string
  end_time: string
  entry_policy: 'individual' | 'team' | 'both'
  visibility: 'public' | 'private'
  max_team_size: number
}

type FormErrors = Partial<Record<keyof FormState, string>>

const initialState: FormState = {
  slug: '',
  title: '',
  start_time: '',
  end_time: '',
  entry_policy: 'individual',
  visibility: 'public',
  max_team_size: 1,
}

export function AdminCreateContestFormPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function validate(): FormErrors {
    const next: FormErrors = {}
    if (!form.slug.trim()) next.slug = 'Slug is required.'
    else if (!/^[a-z0-9-]+$/.test(form.slug)) next.slug = 'Use lowercase letters, numbers, and dashes only.'
    else if (form.slug.trim().length < 2) next.slug = 'Slug must be at least 2 characters.'

    if (!form.title.trim()) next.title = 'Title is required.'
    else if (form.title.trim().length < 2) next.title = 'Title must be at least 2 characters.'

    if (!form.start_time) next.start_time = 'Start time is required.'
    if (!form.end_time) next.end_time = 'End time is required.'
    if (form.start_time && form.end_time && new Date(form.start_time) >= new Date(form.end_time)) {
      next.end_time = 'End time must be after start time.'
    }

    if (form.max_team_size < 1) next.max_team_size = 'Max team size must be at least 1.'
    return next
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = validate()
    setFieldErrors(v)
    if (Object.keys(v).length > 0) {
      setError('Please fix highlighted fields.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const payload: CreateContestPayload = {
        slug: form.slug.trim(),
        title: form.title.trim(),
        entry_policy: form.entry_policy,
        visibility: form.visibility,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        max_team_size: Number(form.max_team_size),
      }
      const contest = await contestsApi.create(payload)
      navigate(`/admin/contests/${contest.id}/settings`)
    } catch (err) {
      if (axios.isAxiosError<{ message?: string }>(err)) {
        const message = err.response?.data?.message ?? 'Failed to create contest.'
        const lower = message.toLowerCase()
        if (lower.includes('slug')) {
          setFieldErrors((prev) => ({ ...prev, slug: 'Slug is invalid or already exists.' }))
          setError('Please fix highlighted fields.')
        } else if (lower.includes('title')) {
          setFieldErrors((prev) => ({ ...prev, title: 'Title is invalid.' }))
          setError('Please fix highlighted fields.')
        } else if (lower.includes('start') || lower.includes('end')) {
          setFieldErrors((prev) => ({ ...prev, end_time: 'Invalid schedule range.' }))
          setError('Please fix highlighted fields.')
        } else {
          setError(message)
        }
      } else {
        setError('Failed to create contest.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full bg-surface-container-lowest border border-outline-variant rounded px-md py-sm text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary'

  return (
    <div className="p-lg max-w-3xl">
      <h1 className="text-2xl font-bold text-on-surface mb-md">Create Contest</h1>
      <form onSubmit={onSubmit} className="bg-surface-container border border-outline-variant rounded-lg p-lg space-y-md">
        <div className="grid md:grid-cols-2 gap-md">
          <div>
            <label className="text-xs text-on-surface-variant uppercase tracking-wider">Slug</label>
            <input className={inputCls} value={form.slug} onChange={(e) => update('slug', e.target.value)} placeholder="olpai-2026-round-1" />
            {fieldErrors.slug && <p className="text-xs text-error mt-xs">{fieldErrors.slug}</p>}
          </div>
          <div>
            <label className="text-xs text-on-surface-variant uppercase tracking-wider">Title</label>
            <input className={inputCls} value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="OLPAI 2026 Round 1" />
            {fieldErrors.title && <p className="text-xs text-error mt-xs">{fieldErrors.title}</p>}
          </div>
          <div>
            <label className="text-xs text-on-surface-variant uppercase tracking-wider">Start Time</label>
            <input type="datetime-local" className={inputCls} value={form.start_time} onChange={(e) => update('start_time', e.target.value)} />
            {fieldErrors.start_time && <p className="text-xs text-error mt-xs">{fieldErrors.start_time}</p>}
          </div>
          <div>
            <label className="text-xs text-on-surface-variant uppercase tracking-wider">End Time</label>
            <input type="datetime-local" className={inputCls} value={form.end_time} onChange={(e) => update('end_time', e.target.value)} />
            {fieldErrors.end_time && <p className="text-xs text-error mt-xs">{fieldErrors.end_time}</p>}
          </div>
          <div>
            <label className="text-xs text-on-surface-variant uppercase tracking-wider">Entry Policy</label>
            <select className={inputCls} value={form.entry_policy} onChange={(e) => update('entry_policy', e.target.value as FormState['entry_policy'])}>
              <option value="individual">individual</option>
              <option value="team">team</option>
              <option value="both">both</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-on-surface-variant uppercase tracking-wider">Visibility</label>
            <select className={inputCls} value={form.visibility} onChange={(e) => update('visibility', e.target.value as FormState['visibility'])}>
              <option value="public">public</option>
              <option value="private">private</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-on-surface-variant uppercase tracking-wider">Max Team Size</label>
            <input type="number" min={1} className={inputCls} value={form.max_team_size} onChange={(e) => update('max_team_size', Number(e.target.value))} />
            {fieldErrors.max_team_size && <p className="text-xs text-error mt-xs">{fieldErrors.max_team_size}</p>}
          </div>
        </div>

        {error && <p className="text-xs text-error">{error}</p>}

        <button type="submit" disabled={submitting} className="px-lg py-sm rounded bg-primary-container text-white text-sm font-semibold disabled:opacity-50">
          {submitting ? 'Creating...' : 'Create Contest'}
        </button>
      </form>
    </div>
  )
}
