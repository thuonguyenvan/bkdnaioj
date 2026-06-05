import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api-client';

export const ResetPasswordPage: React.FC = () => {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();
  const token     = params.get('token') ?? '';

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="panel" style={{ maxWidth: 400, textAlign: 'center' }}>
          <p className="text-danger">Link không hợp lệ hoặc đã hết hạn.</p>
          <Link to="/forgot-password" className="btn btn-primary" style={{ marginTop: '1rem' }}>Thử lại</Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Mật khẩu xác nhận không khớp.'); return; }
    if (password.length < 8)  { setError('Mật khẩu phải có ít nhất 8 ký tự.'); return; }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch {
      setError('Link đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'hsl(var(--background))' }}>
      <div className="panel" style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.5rem' }}>Đặt lại mật khẩu</h1>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', margin: 0 }}>Nhập mật khẩu mới cho tài khoản của bạn.</p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Mật khẩu đã được cập nhật!</h2>
            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem' }}>Đang chuyển hướng đến trang đăng nhập...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="badge badge-danger" style={{ display: 'block', marginBottom: '1rem', padding: '0.75rem', borderRadius: 6 }}>{error}</div>}
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Mật khẩu mới</label>
              <input type="password" className="form-input" placeholder="Tối thiểu 8 ký tự"
                value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Xác nhận mật khẩu</label>
              <input type="password" className="form-input" placeholder="Nhập lại mật khẩu"
                value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
