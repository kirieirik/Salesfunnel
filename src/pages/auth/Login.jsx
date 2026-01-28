import { useState } from 'react'
import { Navigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Input } from '../../components/common'

export default function Login() {
  const { user, signIn } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Get invite token from URL if present
  const inviteToken = searchParams.get('invite')

  if (user) {
    // If user is logged in and has invite token, redirect to onboarding with token
    if (inviteToken) {
      return <Navigate to={`/onboarding?invite=${inviteToken}`} replace />
    }
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: signInError } = await signIn(email, password)
    
    if (signInError) {
      setError(signInError.message)
    }
    
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Logg inn</h1>
        <p className="auth-subtitle">Velkommen tilbake til Salesfunnel</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <Input
            label="E-post"
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          
          <Input
            label="Passord"
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <Button type="submit" loading={loading} className="btn-full">
            Logg inn
          </Button>
        </form>

        <p className="auth-footer">
          Har du ikke konto? <Link to="/register">Registrer deg</Link>
        </p>
      </div>
    </div>
  )
}
