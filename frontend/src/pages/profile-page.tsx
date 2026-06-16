import React, { useState } from 'react';
import { useAuth } from '../contexts/auth-context';
import { api } from '../lib/api-client';
import { CheckCircle, AlertCircle, User as UserIcon, Lock } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user, refreshUser } = useAuth();

  // Profile form state
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [studentId, setStudentId] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  // Password form state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  if (!user) return null;

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      const payload: { full_name?: string; student_id?: string } = {};
      if (fullName.trim() && fullName.trim() !== user.full_name) payload.full_name = fullName.trim();
      if (studentId.trim()) payload.student_id = studentId.trim();
      if (!payload.full_name && !payload.student_id) {
        setProfileMsg({ type: 'error', text: 'No changes to save.' });
        return;
      }
      await api.updateProfile(user.id, payload);
      await refreshUser();
      setStudentId('');
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err?.response?.data?.message || 'Update failed.' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    setPwSaving(true);
    try {
      await api.changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwMsg({ type: 'success', text: 'Password changed successfully.' });
    } catch (err: any) {
      setPwMsg({ type: 'error', text: err?.response?.data?.message || 'Failed to change password.' });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '2.5rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '2rem' }}>My Profile</h1>

      {/* Profile info card */}
      <div className="auth-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <UserIcon size={18} style={{ color: 'hsl(var(--primary))' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Personal Information</h2>
        </div>

        {/* Read-only fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginBottom: '0.25rem' }}>Email</div>
            <div className="form-input" style={{ background: 'hsl(var(--surface-2))', color: 'hsl(var(--text-muted))', cursor: 'default' }}>{user.email}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginBottom: '0.25rem' }}>Username</div>
            <div className="form-input" style={{ background: 'hsl(var(--surface-2))', color: 'hsl(var(--text-muted))', cursor: 'default' }}>{user.username ?? '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginBottom: '0.25rem' }}>Role</div>
            <div style={{ display: 'inline-flex' }}>
              <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700 }}>{user.role}</span>
            </div>
          </div>
        </div>

        {/* Editable fields */}
        {profileMsg && (
          <div className={`alert ${profileMsg.type === 'success' ? 'alert-success' : 'alert-danger'} flex items-center gap-2`} style={{ marginBottom: '1rem' }}>
            {profileMsg.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            <span>{profileMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleProfileSave}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              minLength={2}
              maxLength={255}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Student ID <span style={{ color: 'hsl(var(--text-muted))', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="text"
              className="form-input"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="Leave blank to keep current"
              maxLength={64}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={profileSaving}>
            {profileSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Change password card */}
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <Lock size={18} style={{ color: 'hsl(var(--primary))' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Change Password</h2>
        </div>

        {pwMsg && (
          <div className={`alert ${pwMsg.type === 'success' ? 'alert-success' : 'alert-danger'} flex items-center gap-2`} style={{ marginBottom: '1rem' }}>
            {pwMsg.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            <span>{pwMsg.text}</span>
          </div>
        )}

        <form onSubmit={handlePasswordSave}>
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input
              type="password"
              className="form-input"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-input"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              placeholder="Min. 8 characters"
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input
              type="password"
              className="form-input"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pwSaving}>
            {pwSaving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};
