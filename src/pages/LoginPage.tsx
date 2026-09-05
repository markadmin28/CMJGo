import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { CmjGoLogo } from '../components/CmjGoLogo'
import { useAuth } from '../contexts/AuthContext'
import './LoginPage.css'

export function LoginPage() {
  const { user, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setSubmitting(true)
    const { error: signInError } = await signIn(email.trim(), password)
    if (signInError) setError(signInError)
    setSubmitting(false)
  }

  return (
    <div className="login-shell">
      <div className="login-glow" aria-hidden="true" />

      <div className="login-frame">
        <CmjGoLogo size="lg" className="login-logo" />

        <main className="login-panel">
          <header className="login-brand">
            <h1>Welcome back</h1>
            <p className="brand-sub">Sign in to your CMJGo account</p>
          </header>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>

            {error ? <p className="form-error" role="alert">{error}</p> : null}

            <button className="submit-btn" type="submit" disabled={submitting || loading}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </main>

        <p className="login-footnote">
          New accounts can only be created by the master admin.
        </p>
      </div>
    </div>
  )
}
