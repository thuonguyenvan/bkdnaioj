import React, { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export const AdminContestCreatePage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Form State
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [entryPolicy, setEntryPolicy] = useState<'individual' | 'team' | 'both'>('individual');
  const [formError, setFormError] = useState<string | null>(null);

  // Client-side access guard
  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Create contest mutation
  const createContestMutation = useMutation({
    mutationFn: (payload: any) => api.createContest(payload),
    onSuccess: (newContest) => {
      queryClient.invalidateQueries({ queryKey: ['contests'] });
      // Reset form
      setTitle('');
      setSlug('');
      setDescription('');
      setStartTime('');
      setEndTime('');
      setEntryPolicy('individual');
      setFormError(null);
      // Navigate to contest setup page
      navigate(`/admin/contests/${newContest.id}/setup`);
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message || 'Failed to create contest.');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title || !slug || !startTime || !endTime) {
      setFormError('Please fill in all required fields.');
      return;
    }
    createContestMutation.mutate({
      title,
      slug,
      description,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      entry_policy: entryPolicy,
      visibility: 'public',
      max_team_size: entryPolicy === 'team' || entryPolicy === 'both' ? 3 : 1,
      require_approval: false,
    });
  };

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      
      {/* Back Button */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/contests" className="btn btn-secondary flex items-center gap-2" style={{ width: 'fit-content', padding: '0.4rem 0.8rem' }}>
          <ArrowLeft size={14} /> Back to Contest List
        </Link>
      </div>

      {/* Page Header */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        marginTop: '0.5rem',
        marginBottom: '1.25rem',
        borderBottom: '1px solid #e2e8f0',
        paddingBottom: '0.75rem'
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          Create New Contest
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
          Create a new AI programming contest on the platform.
        </p>
      </div>

      <div className="panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.5rem', marginTop: 0 }}>
          Contest Details
        </h3>

        {formError && (
          <div className="alert alert-danger flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
            <AlertCircle size={18} />
            <div>{formError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Contest Name *</label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
              }}
              required
              placeholder="Example: AI Driving Agent Challenge 2026"
              style={{ padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Friendly URL Slug *</label>
            <input
              type="text"
              className="form-input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              placeholder="Example: ai-driving-challenge-2026"
              style={{ padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Short Description</label>
            <textarea
              className="form-input"
              style={{ height: '100px', resize: 'vertical', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contest goals, rules, and general policy..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Start Time *</label>
              <input
                type="datetime-local"
                className="form-input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                style={{ padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>End Time *</label>
              <input
                type="datetime-local"
                className="form-input"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                style={{ padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Participation Mode</label>
            <select
              className="form-input"
              value={entryPolicy}
              onChange={(e: any) => setEntryPolicy(e.target.value)}
              style={{ padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', height: 'auto' }}
            >
              <option value="individual">Individual Only</option>
              <option value="team">Team Only</option>
              <option value="both">Both Modes</option>
            </select>
          </div>

          <div className="flex gap-3" style={{ justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
            <Link to="/contests" className="btn btn-secondary" style={{ padding: '0.6rem 1.2rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
              Cancel
            </Link>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ backgroundColor: 'hsl(var(--primary))', padding: '0.6rem 1.2rem', borderRadius: '6px' }}
              disabled={createContestMutation.isPending}
            >
              {createContestMutation.isPending ? 'Creating...' : 'Create Contest'}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
};
