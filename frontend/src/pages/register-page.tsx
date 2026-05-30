// RegisterPage — full_name/email/password form wired to POST /api/v1/auth/register
// Stores JWT in AuthContext + localStorage, redirects to / on success
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { FormEvent } from 'react'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import { authApi } from '@/lib/api/auth-api-login-register-me'

export function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { token, user } = await authApi.register({ full_name: fullName, email, password })
      login(token, user)
      navigate('/')
    } catch (err) {
      if (axios.isAxiosError<{ message?: string }>(err)) {
        setError(err.response?.data?.message ?? 'Registration failed. Please check name/email and try again.')
      } else {
        setError('Registration failed. Please check name/email and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'bg-surface-container-lowest border border-outline-variant rounded px-md py-sm text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary transition-colors'

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-md">
      <div className="bg-surface-container border border-outline-variant rounded-xl p-xl w-full max-w-sm">
        <h2 className="text-xl font-bold text-on-surface mb-lg">Create Account</h2>
        <form className="flex flex-col gap-md" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className={inputCls}
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputCls}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={inputCls}
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <Button variant="primary" size="md" className="w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Create Account'}
          </Button>
        </form>
        <p className="text-sm text-on-surface-variant mt-md text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
