import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context';
import { AlertCircle, CheckCircle } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName]       = useState('');
  const [username, setUsername]       = useState('');
  const [studentId, setStudentId]     = useState('');
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (fullName.trim().length < 2) { setError('Full name must be at least 2 characters.'); return; }
    if (username.trim().length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Invalid email (e.g. user@gmail.com).'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setSubmitting(true);
    try {
      await register({
        email,
        password,
        full_name: fullName,
        username: username.trim(),
        student_id: studentId || undefined,
      });
      setSuccess('Account created! Redirecting...');
      setTimeout(() => { navigate('/login'); }, 2000);
    } catch (err: any) {
      const msg: string = err?.response?.data?.message || '';
      if (msg.includes('Email') && msg.includes('email')) setError('Invalid email.');
      else if (msg.includes('FullName') && msg.includes('min')) setError('Full name must be at least 2 characters.');
      else if (msg.includes('Password') && msg.includes('min')) setError('Password must be at least 8 characters.');
      else if (msg.includes('username already')) setError('Username already taken.');
      else if (msg.includes('email already') || msg.includes('duplicate') || msg.includes('23505')) setError('Email already in use.');
      else if (msg.includes('rate') || msg.includes('429')) setError('Too many requests, please try again in 1 minute.');
      else setError(msg || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div className="auth-card" style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.35rem' }}>Create account</h2>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', margin: 0 }}>
            Sign up to join AI competitions.
          </p>
        </div>

        {error && (
          <div className="alert alert-danger flex items-center gap-2" style={{ marginBottom: '1rem' }}>
            <AlertCircle size={16} />
            <div>{error}</div>
          </div>
        )}
        {success && (
          <div className="alert alert-success flex items-center gap-2" style={{ marginBottom: '1rem' }}>
            <CheckCircle size={16} />
            <div>{success}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input
              type="text"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="John Doe"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                required
                placeholder="e.g. johndoe"
                minLength={3}
                maxLength={60}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Student ID <span style={{ color: 'hsl(var(--text-muted))', fontWeight: 400 }}>(optional)</span></label>
              <input
                type="text"
                className="form-input"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. 21IT001"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@domain.com"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="At least 8 characters"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm password</label>
              <input
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter password"
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.25rem' }} disabled={submitting || !!success}>
            {submitting ? 'Creating account...' : 'Sign up'}
          </button>
        </form>

        <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem', color: 'hsl(var(--text-muted))' }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
};
