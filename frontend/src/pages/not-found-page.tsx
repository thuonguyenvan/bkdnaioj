// NotFoundPage — 404 fallback route
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center text-center px-md">
      <div>
        <h1 className="text-7xl font-bold font-mono text-primary mb-md">404</h1>
        <p className="text-on-surface-variant mb-lg">Page not found.</p>
        <Link to="/" className="text-secondary hover:underline text-sm">
          ← Back to homepage
        </Link>
      </div>
    </div>
  )
}
