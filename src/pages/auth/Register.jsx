import { useState } from 'react'
import { Navigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Input } from '../../components/common'

export default function Register() {
  const { user, signUp } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  
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

    if (password !== confirmPassword) {
      setError('Passordene er ikke like')
      return
    }

    if (password.length < 6) {
      setError('Passordet må være minst 6 tegn')
      return
    }

    setLoading(true)

    const { error: signUpError } = await signUp(email, password)
    
    if (signUpError) {
      setError(signUpError.message)
    } else {
      setSuccess(true)
    }
    
    setLoading(false)
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Sjekk e-posten din</h1>
          <p>Vi har sendt deg en bekreftelseslenke. Klikk på lenken for å aktivere kontoen din.</p>
          {inviteToken && (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-light)', marginTop: '0.5rem' }}>
              Etter bekreftelse vil du automatisk bli koblet til organisasjonen du ble invitert til.
            </p>
          )}
          <Link to={inviteToken ? `/login?invite=${inviteToken}` : "/login"} className="btn btn-primary btn-full">
            Tilbake til innlogging
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Opprett konto</h1>
        <p className="auth-subtitle">Kom i gang med Salesfunnel</p>

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
            autoComplete="new-password"
            minLength={6}
          />

          <Input
            label="Bekreft passord"
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />

          <Button type="submit" loading={loading} className="btn-full">
            Registrer
          </Button>
        </form>

        <p className="auth-footer">
          Har du allerede konto? <Link to="/login">Logg inn</Link>
        </p>
      </div>
    </div>
  )
}
