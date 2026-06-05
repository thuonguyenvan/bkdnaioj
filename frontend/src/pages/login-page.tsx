import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context';
import { AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Incorrect email/username or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div className="auth-card" style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ marginBottom: '1.75rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.35rem' }}>Log in</h2>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', margin: 0 }}>
            Welcome back — sign in to continue.
          </p>
        </div>

        {error && (
          <div className="alert alert-danger flex items-center gap-2" style={{ marginBottom: '1rem' }}>
            <AlertCircle size={16} />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email or Username</label>
            <input
              type="text"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="email@domain.com or username"
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Password</label>
              <Link to="/forgot-password" style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={submitting}>
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem', color: 'hsl(var(--text-muted))' }}>
          Don't have an account? <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  );
};
