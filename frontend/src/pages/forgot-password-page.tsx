import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api-client';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail]       = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch {
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'hsl(var(--background))' }}>
      <div className="panel" style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.5rem' }}>Quên mật khẩu</h1>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', margin: 0 }}>
            Nhập email đăng ký và chúng tôi sẽ gửi link đặt lại mật khẩu.
          </p>
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📧</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Kiểm tra email của bạn</h2>
            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem', lineHeight: 1.7 }}>
              Nếu email <strong>{email}</strong> tồn tại trong hệ thống, bạn sẽ nhận được link đặt lại mật khẩu trong vài phút.
            </p>
            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem', marginTop: '1rem' }}>
              Không thấy email? Kiểm tra thư mục Spam.
            </p>
            <Link to="/login" className="btn btn-secondary" style={{ marginTop: '1.5rem', display: 'inline-block' }}>
              Quay lại đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="badge badge-danger" style={{ display: 'block', marginBottom: '1rem', padding: '0.75rem', borderRadius: 6 }}>{error}</div>}
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Email đăng ký</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Đang gửi...' : 'Gửi link đặt lại'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <Link to="/login" style={{ color: 'hsl(var(--text-muted))', fontSize: '0.875rem' }}>
                ← Quay lại đăng nhập
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
