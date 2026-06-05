import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context';
import { UserPlus, AlertCircle, CheckCircle } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Client-side validation
    if (fullName.trim().length < 2) { setError('Họ và tên phải có ít nhất 2 ký tự.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Email không hợp lệ (vd: user@gmail.com).'); return; }
    if (password.length < 8) { setError('Mật khẩu phải có ít nhất 8 ký tự.'); return; }

    setSubmitting(true);
    try {
      await register({
        email,
        password,
        full_name: fullName,
        username: username.trim() || undefined,
        student_id: studentId || undefined,
      });
      setSuccess('Account registered successfully. Redirecting to login...');
      setTimeout(() => { navigate('/login'); }, 2000);
    } catch (err: any) {
      const msg: string = err?.response?.data?.message || '';
      // Convert raw Go validator messages to friendly Vietnamese
      if (msg.includes('Email') && msg.includes('email')) setError('Email không hợp lệ.');
      else if (msg.includes('FullName') && msg.includes('min')) setError('Họ và tên phải có ít nhất 2 ký tự.');
      else if (msg.includes('Password') && msg.includes('min')) setError('Mật khẩu phải có ít nhất 8 ký tự.');
      else if (msg.includes('already') || msg.includes('duplicate') || msg.includes('23505')) setError('Email hoặc username đã được sử dụng.');
      else if (msg.includes('rate') || msg.includes('429')) setError('Quá nhiều yêu cầu, vui lòng thử lại sau 1 phút.');
      else setError(msg || 'Đăng ký thất bại. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container auth-wrapper">
      <div className="auth-shell">
        <aside className="auth-context-card">
          <h1 className="auth-title">Join the contest platform</h1>
          <p className="auth-subtitle">
            Create one account for individual contests, team membership, and support requests.
          </p>
          <div className="auth-meta-list">
            <div className="auth-meta-item">
              <strong>Account identity</strong>
              <span>Your display name is used in registrations, submissions, and team rosters.</span>
            </div>
            <div className="auth-meta-item">
              <strong>Team contests</strong>
              <span>Create or join teams after registration from the Groups page.</span>
            </div>
            <div className="auth-meta-item">
              <strong>Contest access</strong>
              <span>Register for available contests after signing in.</span>
            </div>
          </div>
        </aside>

        <div className="auth-card auth-form-card">
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 className="auth-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserPlus size={22} /> Create Account
            </h2>
            <p className="auth-subtitle">Enter your profile and login credentials.</p>
          </div>

          {error && (
            <div className="alert alert-danger flex items-center gap-2" style={{ marginBottom: '1rem' }}>
              <AlertCircle size={18} />
              <div>{error}</div>
            </div>
          )}

          {success && (
            <div className="alert alert-success flex items-center gap-2" style={{ marginBottom: '1rem' }}>
              <CheckCircle size={18} />
              <div>{success}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Họ và tên</label>
              <input
                type="text"
                className="form-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Nguyễn Văn A"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Username <span style={{ color: 'hsl(var(--text-muted))', fontWeight: 400 }}>(tuỳ chọn)</span>
              </label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="vd: nguyenvana (chỉ chữ thường và số)"
                minLength={3}
                maxLength={60}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Mã sinh viên</label>
              <input
                type="text"
                className="form-input"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Optional"
              />
            </div>

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
                placeholder="At least 8 characters"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={submitting || !!success}>
              {submitting ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem', color: 'hsl(var(--text-muted))' }}>
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
