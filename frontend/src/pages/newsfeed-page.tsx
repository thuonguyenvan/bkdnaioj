import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Contest, type Announcement } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import { Volume2, Megaphone, Clock, Award, Pin, ShieldAlert, Trash2 } from 'lucide-react';

interface RichAnnouncement extends Announcement {
  contestTitle: string;
  isSystem: boolean;
}

export const NewsfeedPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { isAdmin, isJury } = useAuth();
  const isStaff = isAdmin || isJury;

  // Creation form states
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annIsPinned, setAnnIsPinned] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Query all contests
  const { data: contests = [], isLoading: loadingContests, error: contestsError } = useQuery<Contest[]>({
    queryKey: ['contests'],
    queryFn: api.getContests,
  });

  // Query announcements from all contests + system announcements
  const { data: announcements = [], isLoading: loadingAnnouncements } = useQuery<RichAnnouncement[]>({
    queryKey: ['global-announcements', contests.map(c => c.id).join(',')],
    queryFn: async () => {
      // 1. Fetch system-wide announcements
      let systemList: Announcement[] = [];
      try {
        systemList = await api.getSystemAnnouncements();
      } catch (e) {
        console.error("Failed to load system announcements", e);
      }
      const richSystemList = systemList.map(item => ({
        ...item,
        contestTitle: 'System',
        isSystem: true
      }));

      // 2. Fetch contest announcements
      if (contests.length === 0) return richSystemList;
      const results = await Promise.all(
        contests.map(async (contest) => {
          try {
            const list = await api.getAnnouncements(contest.id);
            return list.map(item => ({
              ...item,
              contestTitle: contest.title,
              isSystem: false
            }));
          } catch (e) {
            console.error(`Failed to load announcements for contest ${contest.id}`, e);
            return [];
          }
        })
      );

      const allList = [...richSystemList, ...results.flat()];
      
      // Sort: pinned first, then by created_at DESC
      return allList.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    },
  });

  // Mutation to create system announcement
  const createMutation = useMutation({
    mutationFn: api.createSystemAnnouncement,
    onSuccess: () => {
      setAnnTitle('');
      setAnnContent('');
      setAnnIsPinned(false);
      setFormSuccess('System announcement posted successfully!');
      queryClient.invalidateQueries({ queryKey: ['global-announcements'] });
      setTimeout(() => setFormSuccess(null), 3000);
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message || 'An error occurred while posting the announcement.');
    }
  });

  // Mutation to delete announcement
  const deleteMutation = useMutation({
    mutationFn: api.deleteAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-announcements'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'An error occurred while deleting the announcement.');
    }
  });

  const handleCreateAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!annTitle.trim() || !annContent.trim()) {
      setFormError('Title and content are required.');
      return;
    }
    createMutation.mutate({
      title: annTitle,
      content: annContent,
      is_pinned: annIsPinned
    });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this announcement?')) {
      deleteMutation.mutate(id);
    }
  };

  const isLoading = loadingContests || loadingAnnouncements;

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      
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
          Newsfeed
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
          Latest official announcements, contest updates, and system notices.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.2fr', gap: '2rem' }}>
        
        {/* Main Feed Column */}
        <div>
          {isLoading && (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: '250px' }}>
              <div className="spinner"></div>
              <p style={{ marginTop: '1rem', color: 'hsl(var(--text-muted))' }}>Loading news...</p>
            </div>
          )}

          {!isLoading && contestsError && (
            <div className="alert alert-danger">
              Could not connect to the server to load announcements.
            </div>
          )}

          {!isLoading && !contestsError && announcements.length === 0 && (
            <div className="panel flex flex-col items-center justify-center text-center" style={{ padding: '4rem 2rem' }}>
              <Volume2 size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
              <h3 style={{ margin: 0, color: '#475569' }}>No announcements yet</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem', maxWidth: '380px' }}>
                No official announcements have been posted yet.
              </p>
            </div>
          )}

          {!isLoading && announcements.length > 0 && (
            <div className="flex flex-col gap-6">
              {announcements.map((ann) => (
                <article 
                  key={ann.id} 
                  className="panel"
                  style={{
                    borderLeft: ann.is_pinned ? '4px solid hsl(var(--primary))' : (ann.isSystem ? '4px solid #dc2626' : '1px solid #e2e8f0'),
                    transition: 'all 0.2s ease',
                    boxShadow: ann.is_pinned ? '0 4px 12px hsla(var(--primary), 0.08)' : '0 1px 3px rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <div className="flex justify-between items-start" style={{ marginBottom: '1rem' }}>
                    <div>
                      <div className="flex items-center gap-2" style={{ marginBottom: '0.4rem' }}>
                        <span 
                          style={{ 
                            fontSize: '0.75rem', 
                            backgroundColor: ann.isSystem ? '#fef2f2' : '#eff6ff', 
                            color: ann.isSystem ? '#dc2626' : 'hsl(var(--primary))', 
                            border: ann.isSystem ? '1px solid #fca5a5' : 'none',
                            padding: '0.2rem 0.6rem', 
                            borderRadius: '4px',
                            fontWeight: 600
                          }}
                        >
                          {ann.contestTitle}
                        </span>
                        {ann.is_pinned && (
                          <span 
                            style={{ 
                              fontSize: '0.75rem', 
                              backgroundColor: '#fee2e2', 
                              color: '#ef4444', 
                              padding: '0.2rem 0.45rem', 
                              borderRadius: '4px',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                            title="Pinned"
                          >
                            <Pin size={13} fill="currentColor" />
                          </span>
                        )}
                      </div>
                      <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700, color: '#0f172a' }}>{ann.title}</h2>
                    </div>
                    
                    <div className="flex items-center gap-1.5 text-muted font-mono" style={{ fontSize: '0.8rem' }}>
                      <Clock size={14} style={{ color: '#94a3b8' }} />
                      {formatDateTime(ann.created_at)}
                      {isStaff && (
                        <button
                          onClick={() => handleDelete(ann.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: '0.2rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            marginLeft: '0.5rem'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                          title="Delete announcement"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <p 
                    style={{ 
                      fontSize: '0.95rem', 
                      margin: 0, 
                      whiteSpace: 'pre-line', 
                      lineHeight: '1.6', 
                      color: '#334155' 
                    }}
                  >
                    {ann.content}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Column */}
        <div>
          {/* Admin Posting Section */}
          {isStaff && (
            <div className="panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid #fca5a5', backgroundColor: '#fffdfd' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626' }}>
                <Megaphone size={18} />
                Post System Announcement
              </h3>
              {formError && <div className="alert alert-danger" style={{ fontSize: '0.8rem', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.75rem' }}>{formError}</div>}
              {formSuccess && <div className="alert alert-success" style={{ fontSize: '0.8rem', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.75rem' }}>{formSuccess}</div>}
              <form onSubmit={handleCreateAnnouncement}>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: '#475569' }}>Title</label>
                  <input
                    type="text"
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    placeholder="Example: System maintenance schedule..."
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                  />
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', color: '#475569' }}>Content</label>
                  <textarea
                    value={annContent}
                    onChange={(e) => setAnnContent(e.target.value)}
                    placeholder="Enter announcement details..."
                    rows={4}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', resize: 'vertical' }}
                  />
                </div>
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="is_pinned"
                    checked={annIsPinned}
                    onChange={(e) => setAnnIsPinned(e.target.checked)}
                  />
                  <label htmlFor="is_pinned" style={{ fontSize: '0.8rem', color: '#475569', cursor: 'pointer' }}>Pin to top</label>
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Posting...' : 'Post announcement'}
                </button>
              </form>
            </div>
          )}

          {/* Platform Info Section */}
          <div className="panel" style={{ padding: '1.5rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Award size={18} style={{ color: 'hsl(var(--primary))' }} />
              About the Platform
            </h3>
            <p style={{ fontSize: '0.875rem', lineHeight: '1.6', color: '#475569', margin: 0 }}>
              Welcome to the AI OLP contest platform. Follow the newsfeed for official updates, contest changes, and technical notices.
            </p>
            <hr style={{ margin: '1rem 0', borderColor: '#e2e8f0' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
              <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '0.1rem', color: '#eab308' }} />
              <span>If you encounter technical issues during submission, please create a support ticket from the relevant contest page.</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
