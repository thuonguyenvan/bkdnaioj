import React, { useState } from 'react';
import { useAuth } from '../contexts/auth-context';
import { api } from '../lib/api-client';
import { CheckCircle, AlertCircle } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user, refreshUser } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [studentId, setStudentId] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  if (!user) return null;

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    const payload: { full_name?: string; student_id?: string } = {};
    if (fullName.trim() && fullName.trim() !== user.full_name) payload.full_name = fullName.trim();
    if (studentId.trim()) payload.student_id = studentId.trim();
    if (!Object.keys(payload).length) {
      setProfileMsg({ ok: false, text: 'No changes to save.' });
      return;
    }
    setProfileSaving(true);
    try {
      await api.updateProfile(user.id, payload);
      await refreshUser();
      setStudentId('');
      setProfileMsg({ ok: true, text: 'Saved.' });
    } catch (err: any) {
      setProfileMsg({ ok: false, text: err?.response?.data?.message || 'Update failed.' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: 'Passwords do not match.' }); return; }
    if (newPw.length < 8) { setPwMsg({ ok: false, text: 'Minimum 8 characters.' }); return; }
    setPwSaving(true);
    try {
      await api.changePassword(currentPw, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwMsg({ ok: true, text: 'Password updated.' });
    } catch (err: any) {
      setPwMsg({ ok: false, text: err?.response?.data?.message || 'Failed to change password.' });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      <div className="page-header">
        <h1 className="page-title">Account Settings</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Left — identity summary */}
        <div className="panel" style={{ padding: '1.25rem' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'hsl(var(--primary))', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem',
            fontFamily: 'var(--font-mono)',
          }}>
            {user.full_name.charAt(0).toUpperCase()}
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'hsl(var(--text-main))' }}>{user.full_name}</div>
          {user.username && (
            <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
              @{user.username}
            </div>
          )}
          <div style={{ marginTop: '0.75rem' }}>
            <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>
              {user.role}
            </span>
          </div>
          <div style={{ marginTop: '1rem', borderTop: '1px solid hsl(var(--border))', paddingTop: '0.75rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'hsl(var(--text-muted))', marginBottom: '0.2rem' }}>Email</div>
            <div style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{user.email}</div>
          </div>
        </div>

        {/* Right — settings forms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Profile */}
          <div className="panel" style={{ padding: 0 }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid hsl(var(--border))' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Profile</h3>
            </div>
            <div style={{ padding: '1.25rem' }}>
              {profileMsg && (
                <div className={`alert ${profileMsg.ok ? 'alert-success' : 'alert-danger'} flex items-center gap-2`} style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', fontSize: '0.82rem' }}>
                  {profileMsg.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                  {profileMsg.text}
                </div>
              )}
              <form onSubmit={handleProfileSave}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Full Name</label>
                    <input type="text" className="form-input" value={fullName}
                      onChange={e => setFullName(e.target.value)} minLength={2} maxLength={255} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Student ID</label>
                    <input type="text" className="form-input" value={studentId}
                      onChange={e => setStudentId(e.target.value)}
                      placeholder="Leave blank to keep current" maxLength={64} />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.4rem 1rem' }} disabled={profileSaving}>
                  {profileSaving ? 'Saving...' : 'Save'}
                </button>
              </form>
            </div>
          </div>

          {/* Password */}
          <div className="panel" style={{ padding: 0 }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid hsl(var(--border))' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Password</h3>
            </div>
            <div style={{ padding: '1.25rem' }}>
              {pwMsg && (
                <div className={`alert ${pwMsg.ok ? 'alert-success' : 'alert-danger'} flex items-center gap-2`} style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', fontSize: '0.82rem' }}>
                  {pwMsg.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                  {pwMsg.text}
                </div>
              )}
              <form onSubmit={handlePasswordSave}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Current Password</label>
                    <input type="password" className="form-input" value={currentPw}
                      onChange={e => setCurrentPw(e.target.value)} required placeholder="••••••••"
                      autoComplete="current-password" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">New Password</label>
                    <input type="password" className="form-input" value={newPw}
                      onChange={e => setNewPw(e.target.value)} required placeholder="Min. 8 chars"
                      minLength={8} autoComplete="new-password" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Confirm</label>
                    <input type="password" className="form-input" value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)} required placeholder="••••••••"
                      autoComplete="new-password" />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.4rem 1rem' }} disabled={pwSaving}>
                  {pwSaving ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
