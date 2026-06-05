import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Team, type TeamMember } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import { Users, UserPlus, Trash2, Plus, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export const TeamsPage: React.FC = () => {
  const { user, isAdmin, isJury } = useAuth();

  if (isAdmin || isJury) {
    return <Navigate to="/" replace />;
  }
  const queryClient = useQueryClient();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamSlug, setNewTeamSlug] = useState('');
  const [inviteUserId, setInviteUserId] = useState('');

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Queries
  const { data: myTeams = [], isLoading: loadingTeams, error: teamsError } = useQuery<Team[]>({
    queryKey: ['myTeams'],
    queryFn: () => api.getMyTeams(),
    enabled: !!user,
  });

  const selectedTeam = myTeams.find(t => t.id === selectedTeamId);

  const { data: teamMembers = [], isLoading: loadingMembers, refetch: refetchMembers } = useQuery<TeamMember[]>({
    queryKey: ['teamMembers', selectedTeamId],
    queryFn: () => api.getTeamMembers(selectedTeamId!),
    enabled: !!selectedTeamId,
  });

  // Mutations
  const createTeamMutation = useMutation({
    mutationFn: (payload: { name: string; slug: string }) => api.createTeam(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['myTeams'] });
      setNewTeamName('');
      setNewTeamSlug('');
      setSelectedTeamId(data.id);
      setActionSuccess(`Team "${data.name}" created successfully!`);
      setActionError(null);
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message || 'Failed to create team. Ensure the slug is unique.');
      setActionSuccess(null);
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: (payload: { user_id: string; role: 'manager' | 'member' }) =>
      api.addTeamMember(selectedTeamId!, payload),
    onSuccess: () => {
      setInviteUserId('');
      refetchMembers();
      setActionSuccess('Teammate invited successfully!');
      setActionError(null);
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message || 'Failed to add member. Please verify the User UUID.');
      setActionSuccess(null);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.removeTeamMember(selectedTeamId!, userId),
    onSuccess: () => {
      refetchMembers();
      setActionSuccess('Teammate removed successfully.');
      setActionError(null);
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message || 'Failed to remove member.');
      setActionSuccess(null);
    },
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewTeamName(val);
    // Simple auto slug generator
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setNewTeamSlug(slug);
  };

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newTeamSlug.trim()) {
      setActionError('Both Name and Slug are required.');
      return;
    }
    createTeamMutation.mutate({
      name: newTeamName.trim(),
      slug: newTeamSlug.trim(),
    });
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUserId.trim()) return;
    addMemberMutation.mutate({
      user_id: inviteUserId.trim(),
      role: 'member',
    });
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
          Team Management
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
          Create teams, invite teammates, and manage rosters for team contests.
        </p>
      </div>

      {actionError && (
        <div className="alert alert-danger flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
          <AlertCircle size={16} />
          <div>{actionError}</div>
        </div>
      )}

      {actionSuccess && (
        <div className="alert alert-success flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
          <CheckCircle2 size={16} />
          <div>{actionSuccess}</div>
        </div>
      )}

      <div className="grid-1-3">
        {/* Left Panel: Teams List & Creation (Unified into a single premium card) */}
        <div className="flex flex-col gap-4">
          <div className="team-card" style={{ minHeight: '480px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} style={{ color: 'hsl(var(--primary))' }} />
              My Teams
            </h3>

            {loadingTeams ? (
              <div className="flex justify-center" style={{ padding: '1.5rem 0' }}>
                <Loader2 className="spinner" size={24} />
              </div>
            ) : teamsError ? (
              <p style={{ color: 'hsl(var(--danger))', fontSize: '0.85rem' }}>Could not load teams.</p>
            ) : myTeams.length === 0 ? (
              <div style={{ padding: '1.25rem 1rem', border: '1px dashed #cbd5e1', borderRadius: '8px', backgroundColor: '#f8fafc', textAlign: 'center', marginBottom: '1.25rem' }}>
                <p style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
                  You are not in any team yet.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2" style={{ marginBottom: '1.25rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                {myTeams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => {
                      setSelectedTeamId(team.id);
                      setActionError(null);
                      setActionSuccess(null);
                    }}
                    className={`team-btn-item ${selectedTeamId === team.id ? 'active' : ''}`}
                  >
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{team.name}</div>
                    </div>
                    {team.owner_id === user?.id && (
                      <span className="team-badge-owner">
                        Manager
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem', marginTop: 'auto' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} style={{ color: 'hsl(var(--primary))' }} />
                Create New Team
              </h3>

              <form onSubmit={handleCreateTeam} className="flex flex-col gap-3">
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem', display: 'block' }}>
                    Team Name
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. DUT.AI"
                    value={newTeamName}
                    onChange={handleNameChange}
                    required
                    style={{ borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem', display: 'block' }}>
                    Identifier Slug (URL)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. DUT.AI"
                    value={newTeamSlug}
                    onChange={(e) => setNewTeamSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    required
                    style={{ borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary flex items-center justify-center gap-2"
                  style={{ width: '100%', marginTop: '0.5rem', fontWeight: 600, borderRadius: '6px', padding: '0.55rem 1rem', boxShadow: '0 4px 12px hsla(var(--primary), 0.12)' }}
                  disabled={createTeamMutation.isPending}
                >
                  {createTeamMutation.isPending ? <Loader2 className="spinner" size={16} /> : <Plus size={16} />}
                  Create Team
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Panel: Selected Team Members */}
        <div>
          {selectedTeam ? (
            <div className="team-card" style={{ minHeight: '480px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="flex justify-between items-start" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '1.25rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{selectedTeam.name}</h2>
                </div>
                <span className="badge badge-info" style={{ textTransform: 'uppercase', backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '0.75rem', fontWeight: 700, padding: '0.35rem 0.75rem', borderRadius: '6px' }}>
                  {teamMembers.length} members
                </span>
              </div>

              {/* Members Table */}
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.85rem' }}>Team Members</h3>
                {loadingMembers ? (
                  <div className="flex justify-center" style={{ padding: '2rem 0' }}>
                    <Loader2 className="spinner" size={24} />
                  </div>
                ) : (
                  <div className="table-container" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.01)' }}>
                    <table className="oj-table" style={{ margin: 0 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ color: '#475569', fontWeight: 600, padding: '0.85rem 1rem' }}>Member</th>
                          <th style={{ color: '#475569', fontWeight: 600, padding: '0.85rem 1rem' }}>Email Address</th>
                          <th style={{ color: '#475569', fontWeight: 600, padding: '0.85rem 1rem' }}>Role</th>
                          <th style={{ color: '#475569', fontWeight: 600, padding: '0.85rem 1rem' }}>Joined At</th>
                          {selectedTeam.owner_id === user?.id && <th style={{ width: '90px', textAlign: 'center', color: '#475569', fontWeight: 600, padding: '0.85rem 1rem' }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {teamMembers.map((member) => (
                          <tr key={member.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 600, color: '#1e293b' }}>{member.full_name || 'Pending'}</div>
                              <div className="font-mono text-muted" style={{ fontSize: '0.675rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                                UUID: {member.user_id}
                              </div>
                            </td>
                            <td className="font-mono" style={{ fontSize: '0.85rem', color: '#475569', padding: '0.85rem 1rem' }}>
                              {member.email}
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <span className={member.role === 'manager' ? 'team-badge-owner' : 'team-badge-member'}>
                                {member.role === 'manager' ? 'Manager' : 'Member'}
                              </span>
                            </td>
                            <td className="font-mono" style={{ fontSize: '0.8rem', color: '#64748b', padding: '0.85rem 1rem' }}>
                              {new Date(member.joined_at).toLocaleDateString('vi-VN')}
                            </td>
                            {selectedTeam.owner_id === user?.id && (
                              <td style={{ textAlign: 'center', padding: '0.85rem 1rem' }}>
                                {member.user_id === user.id ? (
                                  <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                    You
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => removeMemberMutation.mutate(member.user_id)}
                                    className="text-danger flex items-center justify-center gap-1"
                                    style={{
                                      border: 'none',
                                      background: 'none',
                                      cursor: 'pointer',
                                      margin: '0 auto',
                                      padding: '0.25rem',
                                      color: '#ef4444',
                                      borderRadius: '4px',
                                      transition: 'background-color 0.15s ease'
                                    }}
                                    title="Remove from team"
                                    disabled={removeMemberMutation.isPending}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Add Member Form (Only visible to managers/owners) */}
              {selectedTeam.owner_id === user?.id && (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem', marginTop: 'auto' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserPlus size={18} style={{ color: 'hsl(var(--primary))' }} />
                    Invite Teammate
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                    Add another contestant to your team by entering their user UUID.
                  </p>

                  <form onSubmit={handleAddMember} className="flex gap-2" style={{ maxWidth: '600px' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                      required
                      style={{ flex: 1, borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary flex items-center gap-2"
                      disabled={addMemberMutation.isPending}
                      style={{ fontWeight: 600, borderRadius: '6px', padding: '0.6rem 1.25rem' }}
                    >
                      {addMemberMutation.isPending ? <Loader2 className="spinner" size={16} /> : <UserPlus size={16} />}
                      Invite Member
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="team-empty-state" style={{ minHeight: '480px' }}>
              <div style={{ backgroundColor: '#eff6ff', padding: '1.25rem', borderRadius: '50%', marginBottom: '1.25rem', display: 'inline-flex' }}>
                <Users size={40} style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <h3 style={{ color: '#0f172a', fontWeight: 700, margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>No Team Selected</h3>
              <p style={{ fontSize: '0.875rem', color: '#64748b', maxWidth: '340px', margin: 0, lineHeight: '1.6' }}>
                Select a team from the left list to manage members or invite new teammates.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
