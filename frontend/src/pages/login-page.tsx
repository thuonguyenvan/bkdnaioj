import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context';
import { LogIn, AlertCircle } from 'lucide-react';

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
      setError(err?.response?.data?.message || 'Email or password is incorrect.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container auth-wrapper">
      <div className="auth-shell">
        <aside className="auth-context-card">
          <h1 className="auth-title">AI Olympic Online Judge</h1>
          <p className="auth-subtitle">
            Sign in to access contest phases, submit artifacts, and track standings.
          </p>
          <div className="auth-meta-list">
            <div className="auth-meta-item">
              <strong>Contest workspace</strong>
              <span>Manage official, virtual, and practice participation from the same account.</span>
            </div>
            <div className="auth-meta-item">
              <strong>Submission history</strong>
              <span>Review raw scores and select final submissions for each phase.</span>
            </div>
            <div className="auth-meta-item">
              <strong>Support channel</strong>
              <span>Use contest clarifications and tickets when you need organizer help.</span>
            </div>
          </div>
        </aside>

        <div className="auth-card auth-form-card">
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 className="auth-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <LogIn size={22} /> Log in
            </h2>
            <p className="auth-subtitle">Use your registered account to continue.</p>
          </div>

          {error && (
            <div className="alert alert-danger flex items-center gap-2" style={{ marginBottom: '1rem' }}>
              <AlertCircle size={18} />
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="user@domain.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
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
            Do not have an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
