// Configured Axios instance for OLPAI backend (/api/v1)
// Request interceptor: attach JWT from localStorage
// Response interceptor: redirect to /login on 401
import axios from 'axios'

const TOKEN_KEY = 'olpai_token'

const apiURL = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
  baseURL: `${apiURL}/api/v1`,
  timeout: 30_000,
})

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem('olpai_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)
