import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Team, type TeamMember, type TeamInvitation } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import { Users, UserPlus, Trash2, Plus, AlertCircle, CheckCircle2, Loader2, Pencil, X, Check, Bell } from 'lucide-react';

export const TeamsPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamSlug, setNewTeamSlug] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const flash = (msg: string) => { setActionSuccess(msg); setActionError(null); setTimeout(() => setActionSuccess(null), 3000); };
  const flashErr = (msg: string) => { setActionError(msg); setActionSuccess(null); };

  const { data: myTeams = [], isLoading: loadingTeams } = useQuery<Team[]>({
    queryKey: ['myTeams'],
    queryFn: () => api.getMyTeams(),
    enabled: !!user,
  });

  const { data: invitations = [] } = useQuery<TeamInvitation[]>({
    queryKey: ['teamInvitations'],
    queryFn: () => api.listInvitations(),
    enabled: !!user,
  });

  const selectedTeam = myTeams.find(t => t.id === selectedTeamId) ?? null;

  const { data: teamMembers = [], isLoading: loadingMembers, refetch: refetchMembers } = useQuery<TeamMember[]>({
    queryKey: ['teamMembers', selectedTeamId],
    queryFn: () => api.getTeamMembers(selectedTeamId!),
    enabled: !!selectedTeamId,
  });

  const createTeamMutation = useMutation({
    mutationFn: (p: { name: string; slug: string }) => api.createTeam(p),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['myTeams'] });
      setNewTeamName(''); setNewTeamSlug('');
      setSelectedTeamId(data.id);
      flash(`Team "${data.name}" created!`);
    },
    onError: (err: any) => flashErr(err?.response?.data?.message || 'Failed to create team.'),
  });

  const updateTeamMutation = useMutation({
    mutationFn: (p: { id: string; name: string }) => api.updateTeam(p.id, { name: p.name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['myTeams'] }); setEditingName(false); flash('Team name updated.'); },
    onError: (err: any) => flashErr(err?.response?.data?.message || 'Failed to update team.'),
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (id: string) => api.deleteTeam(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myTeams'] });
      setSelectedTeamId(null);
      flash('Team deleted.');
    },
    onError: (err: any) => flashErr(err?.response?.data?.message || 'Failed to delete team.'),
  });

  const addMemberMutation = useMutation({
    mutationFn: (p: { username: string; role: 'manager' | 'member' }) => api.addTeamMember(selectedTeamId!, p),
    onSuccess: () => { setInviteUsername(''); refetchMembers(); flash('Invitation sent!'); },
    onError: (err: any) => flashErr(err?.response?.data?.message || 'Failed to invite member.'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.removeTeamMember(selectedTeamId!, userId),
    onSuccess: () => { refetchMembers(); flash('Member removed.'); },
    onError: (err: any) => flashErr(err?.response?.data?.message || 'Failed to remove member.'),
  });

  const acceptMutation = useMutation({
    mutationFn: (teamId: string) => api.acceptInvitation(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myTeams'] });
      queryClient.invalidateQueries({ queryKey: ['teamInvitations'] });
      flash('Joined team!');
    },
    onError: (err: any) => flashErr(err?.response?.data?.message || 'Failed to accept.'),
  });

  const declineMutation = useMutation({
    mutationFn: (teamId: string) => api.declineInvitation(teamId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teamInvitations'] }); flash('Invitation declined.'); },
    onError: (err: any) => flashErr(err?.response?.data?.message || 'Failed to decline.'),
  });

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newTeamSlug.trim()) { flashErr('Name and slug are required.'); return; }
    createTeamMutation.mutate({ name: newTeamName.trim(), slug: newTeamSlug.trim() });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewTeamName(val);
    setNewTeamSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim()) return;
    addMemberMutation.mutate({ username: inviteUsername.trim(), role: 'member' });
  };

  const isOwner = selectedTeam?.owner_id === user?.id;

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Team Management</h1>
        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.2rem 0 0' }}>
          Create teams, invite teammates, and manage rosters for team contests.
        </p>
      </div>

      {actionError && <div className="alert alert-danger flex items-center gap-2" style={{ marginBottom: '1rem' }}><AlertCircle size={16} />{actionError}</div>}
      {actionSuccess && <div className="alert alert-success flex items-center gap-2" style={{ marginBottom: '1rem' }}><CheckCircle2 size={16} />{actionSuccess}</div>}

      {/* Pending invitations banner */}
      {invitations.length > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#1e40af', marginBottom: '0.75rem' }}>
            <Bell size={16} /> Pending invitations ({invitations.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {invitations.map(inv => (
              <div key={inv.team_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: 8, padding: '0.6rem 1rem', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{inv.team_name}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '0.5rem' }}>as {inv.role}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => acceptMutation.mutate(inv.team_id)} className="btn btn-primary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} disabled={acceptMutation.isPending}>
                    <Check size={13} /> Accept
                  </button>
                  <button onClick={() => declineMutation.mutate(inv.team_id)} className="btn btn-secondary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} disabled={declineMutation.isPending}>
                    <X size={13} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid-1-3">
        {/* Left: teams list + create */}
        <div className="flex flex-col gap-4">
          <div className="team-card" style={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} style={{ color: 'hsl(var(--primary))' }} /> My Teams
            </h3>

            {loadingTeams ? <Loader2 className="spinner" size={24} /> : myTeams.length === 0 ? (
              <div style={{ padding: '1.25rem', border: '1px dashed #cbd5e1', borderRadius: 8, background: '#f8fafc', textAlign: 'center', marginBottom: '1rem' }}>
                <p style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>You are not in any team yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem', maxHeight: 200, overflowY: 'auto' }}>
                {myTeams.map(t => (
                  <button key={t.id} onClick={() => { setSelectedTeamId(t.id); setEditingName(false); }} className={`team-btn-item ${selectedTeamId === t.id ? 'active' : ''}`}>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>/{t.slug}</div>
                    </div>
                    {t.owner_id === user?.id && <span className="team-badge-owner">Owner</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Create team form */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: 'auto' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Plus size={15} /> Create New Team
              </h4>
              <form onSubmit={handleCreateTeam} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input type="text" className="form-input" placeholder="Team Name" value={newTeamName} onChange={handleNameChange} style={{ fontSize: '0.85rem' }} />
                <input type="text" className="form-input" placeholder="slug (auto)" value={newTeamSlug}
                  onChange={e => setNewTeamSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  style={{ fontSize: '0.85rem', fontFamily: 'monospace' }} />
                <button type="submit" className="btn btn-primary" style={{ fontSize: '0.85rem' }} disabled={createTeamMutation.isPending}>
                  {createTeamMutation.isPending ? <Loader2 size={14} className="spinner" /> : <Plus size={14} />} Create Team
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right: team detail */}
        <div className="team-card" style={{ minHeight: 480, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!selectedTeam ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic' }}>
              Select a team to view details.
            </div>
          ) : (
            <>
              {/* Team header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                {editingName ? (
                  <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                    <input autoFocus className="form-input" value={editName} onChange={e => setEditName(e.target.value)}
                      style={{ fontSize: '1rem', fontWeight: 700, flex: 1 }} />
                    <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem' }}
                      onClick={() => updateTeamMutation.mutate({ id: selectedTeam.id, name: editName })}
                      disabled={updateTeamMutation.isPending}><Check size={14} /></button>
                    <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem' }}
                      onClick={() => setEditingName(false)}><X size={14} /></button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{selectedTeam.name}</h2>
                    {isOwner && (
                      <button onClick={() => { setEditName(selectedTeam.name); setEditingName(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.15rem' }} title="Edit name">
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                )}
                {isOwner && !editingName && (
                  <button onClick={() => { if (confirm(`Delete team "${selectedTeam.name}"? This cannot be undone.`)) deleteTeamMutation.mutate(selectedTeam.id); }}
                    className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', color: '#ef4444', borderColor: '#fca5a5' }}
                    disabled={deleteTeamMutation.isPending}>
                    <Trash2 size={13} /> Delete team
                  </button>
                )}
              </div>

              {/* Members table */}
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.6rem' }}>
                  Members ({teamMembers.filter(m => m.status === 'accepted').length})
                  {teamMembers.some(m => m.status === 'pending') && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 400, color: '#f59e0b', marginLeft: '0.5rem' }}>
                      + {teamMembers.filter(m => m.status === 'pending').length} pending
                    </span>
                  )}
                </h3>

                {loadingMembers ? <Loader2 className="spinner" size={20} /> : (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    <table className="oj-table" style={{ margin: 0 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th>Name</th>
                          <th>Username</th>
                          <th>Role</th>
                          <th>Status</th>
                          {isOwner && <th style={{ width: 60, textAlign: 'center' }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {teamMembers.map(m => (
                          <tr key={m.user_id} style={{ borderBottom: '1px solid #f1f5f9', opacity: m.status === 'pending' ? 0.7 : 1 }}>
                            <td style={{ padding: '0.7rem 1rem', fontWeight: 600, color: '#1e293b' }}>{m.full_name}</td>
                            <td className="font-mono" style={{ padding: '0.7rem 1rem', fontSize: '0.82rem', color: '#475569' }}>
                              {m.username ?? <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>—</span>}
                            </td>
                            <td style={{ padding: '0.7rem 1rem' }}>
                              <span className={m.role === 'manager' ? 'team-badge-owner' : 'team-badge-member'}>
                                {m.role}
                              </span>
                            </td>
                            <td style={{ padding: '0.7rem 1rem' }}>
                              {m.status === 'pending' ? (
                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f59e0b', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: 4 }}>Pending</span>
                              ) : (
                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#15803d', background: '#dcfce7', padding: '0.15rem 0.5rem', borderRadius: 4 }}>Accepted</span>
                              )}
                            </td>
                            {isOwner && (
                              <td style={{ textAlign: 'center', padding: '0.7rem 0.5rem' }}>
                                {m.user_id === user?.id ? (
                                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>You</span>
                                ) : (
                                  <button onClick={() => removeMemberMutation.mutate(m.user_id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.2rem' }}
                                    disabled={removeMemberMutation.isPending} title="Remove">
                                    <Trash2 size={15} />
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

              {/* Invite form */}
              {isOwner && (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem', marginTop: 'auto' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <UserPlus size={16} style={{ color: 'hsl(var(--primary))' }} /> Invite Teammate
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: '0.75rem' }}>
                    Enter a username or email. They'll need to accept before joining.
                  </p>
                  <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.5rem', maxWidth: 520 }}>
                    <input type="text" className="form-input" placeholder="username or email@domain.com"
                      value={inviteUsername} onChange={e => setInviteUsername(e.target.value)}
                      required style={{ flex: 1, fontSize: '0.85rem' }} />
                    <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}
                      disabled={addMemberMutation.isPending}>
                      {addMemberMutation.isPending ? <Loader2 size={14} className="spinner" /> : <UserPlus size={14} />} Send invite
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
