// Auth API — register, login, get current user (me)
import type { User } from '@/types/api-types'
import { api } from '@/lib/axios-api-client-with-jwt-interceptors'

interface BackendAuthToken {
  access_token: string
  token_type: string
  expires_in: number
}

interface BackendAuthResponse {
  token: BackendAuthToken
  user: User
}

export interface AuthResponse {
  token: string
  user: User
}

export interface RegisterPayload {
  full_name: string
  email: string
  password: string
}

export interface LoginPayload {
  email: string
  password: string
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    api.post<BackendAuthResponse>('/auth/register', payload).then((r) => ({
      token: r.data.token.access_token,
      user: r.data.user,
    })),

  login: (payload: LoginPayload) =>
    api.post<BackendAuthResponse>('/auth/login', payload).then((r) => ({
      token: r.data.token.access_token,
      user: r.data.user,
    })),

  me: () =>
    api.get<User>('/auth/me').then((r) => r.data),
}
