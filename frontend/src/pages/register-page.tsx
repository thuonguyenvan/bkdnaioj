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

    if (fullName.trim().length < 2) { setError('Họ và tên phải có ít nhất 2 ký tự.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Email không hợp lệ (vd: user@gmail.com).'); return; }
    if (password.length < 8) { setError('Mật khẩu phải có ít nhất 8 ký tự.'); return; }
    if (password !== confirmPassword) { setError('Mật khẩu xác nhận không khớp.'); return; }

    setSubmitting(true);
    try {
      await register({
        email,
        password,
        full_name: fullName,
        username: username.trim() || undefined,
        student_id: studentId || undefined,
      });
      setSuccess('Đăng ký thành công! Đang chuyển hướng...');
      setTimeout(() => { navigate('/login'); }, 2000);
    } catch (err: any) {
      const msg: string = err?.response?.data?.message || '';
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
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div className="auth-card" style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.35rem' }}>Tạo tài khoản</h2>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', margin: 0 }}>
            Đăng ký để tham gia các cuộc thi AI.
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">
                Username <span style={{ color: 'hsl(var(--text-muted))', fontWeight: 400 }}>(tuỳ chọn)</span>
              </label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="vd: nguyenvana"
                minLength={3}
                maxLength={60}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mã sinh viên <span style={{ color: 'hsl(var(--text-muted))', fontWeight: 400 }}>(tuỳ chọn)</span></label>
              <input
                type="text"
                className="form-input"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="VD: 21IT001"
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
              <label className="form-label">Mật khẩu</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Ít nhất 8 ký tự"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Xác nhận mật khẩu</label>
              <input
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Nhập lại mật khẩu"
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.25rem' }} disabled={submitting || !!success}>
            {submitting ? 'Đang tạo tài khoản...' : 'Đăng ký'}
          </button>
        </form>

        <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem', color: 'hsl(var(--text-muted))' }}>
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
};
