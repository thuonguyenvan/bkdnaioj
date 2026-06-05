import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type User } from '../lib/api-client';
import { useAuth } from '../contexts/auth-context';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

export const AdminUsersPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;
  const offset = (page - 1) * limit;

  // Protect client-side page access
  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Fetch admin stats (to get total users count)
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['adminStats'],
    queryFn: api.getAdminStats,
  });

  const totalUsers = stats?.users ?? 0;
  const totalPages = Math.ceil(totalUsers / limit) || 1;

  // Fetch users for the current page
  const { data: users = [], isLoading: loadingUsers, error, refetch: refetchUsers } = useQuery<User[]>({
    queryKey: ['adminUsers', page],
    queryFn: () => api.listUsers(limit, offset),
  });

  // Mutation to update user role
  const updateUserRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api.updateUserRole(id, role),
    onSuccess: () => {
      refetchUsers();
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
    },
  });

  const isLoading = loadingStats || loadingUsers;

  return (
    <div className="container" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>
      
      <div className="page-header">
        <h1 className="page-title">Users & Roles</h1>
        <p className="page-subtitle">
          Assign platform roles (Admin, Contestant) to user accounts.
        </p>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
          <div className="spinner"></div>
          <p style={{ marginTop: '1rem', color: 'hsl(var(--text-muted))' }}>Loading user accounts...</p>
        </div>
      )}

      {!isLoading && error && (
        <div className="alert alert-danger">
          Could not load user accounts from the server. Please check your permissions.
        </div>
      )}

      {!isLoading && !error && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} style={{ color: 'hsl(var(--primary))' }} />
              User Accounts ({totalUsers})
            </h3>
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table className="oj-table">
              <thead>
                <tr>
                  <th>User Name</th>
                  <th>Username</th>
                  <th>Email Address</th>
                  <th>Current Role</th>
                  <th style={{ textAlign: 'right', width: '280px' }}>Role Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>{u.full_name}</td>
                    <td className="font-mono" style={{ fontSize: '0.82rem', color: '#475569' }}>{u.username ?? '—'}</td>
                    <td className="font-mono" style={{ fontSize: '0.82rem', color: '#475569' }}>{u.email}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          backgroundColor: u.role === 'admin' ? '#fee2e2' : '#dcfce7',
                          color: u.role === 'admin' ? '#b91c1c' : '#15803d',
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '1.15rem 1.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => updateUserRoleMutation.mutate({ id: u.id, role: 'admin' })}
                            className="btn btn-secondary btn-sm"
                            disabled={updateUserRoleMutation.isPending}
                          >
                            Set Admin
                          </button>
                        )}
                        {u.role !== 'contestant' && (
                          <button
                            onClick={() => updateUserRoleMutation.mutate({ id: u.id, role: 'contestant' })}
                            className="btn btn-secondary btn-sm"
                            disabled={updateUserRoleMutation.isPending}
                          >
                            Set Contestant
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                Showing <strong>{offset + 1}</strong> to <strong>{Math.min(offset + limit, totalUsers)}</strong> of <strong>{totalUsers}</strong> users
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="btn btn-secondary flex items-center gap-1"
                  style={{ 
                    padding: '0.4rem 0.8rem', 
                    fontSize: '0.85rem', 
                    border: '1px solid #cbd5e1',
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                    opacity: page === 1 ? 0.5 : 1
                  }}
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <span style={{ fontSize: '0.875rem', color: '#334155', fontWeight: 600 }}>
                  Page {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages}
                  className="btn btn-secondary flex items-center gap-1"
                  style={{ 
                    padding: '0.4rem 0.8rem', 
                    fontSize: '0.85rem', 
                    border: '1px solid #cbd5e1',
                    cursor: page === totalPages ? 'not-allowed' : 'pointer',
                    opacity: page === totalPages ? 0.5 : 1
                  }}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
