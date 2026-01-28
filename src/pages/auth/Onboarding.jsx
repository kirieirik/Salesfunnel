import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, ArrowRight, Loader2, User, UserPlus, Check } from 'lucide-react'
import { useTenant } from '../../contexts/TenantContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, isDemoMode } from '../../lib/supabase'
import { Button, Input } from '../../components/common'
import './Auth.css'

export default function Onboarding() {
  const { createTenant, updateProfile, profile, tenant, refreshTenant } = useTenant()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  
  // Check for invitation token in URL
  const inviteToken = searchParams.get('invite')
  
  // Sjekk om profil er komplett for å hoppe direkte til steg 2
  const profileComplete = profile?.first_name && profile?.last_name
  // Hvis bruker allerede har tenant, trenger vi bare profilinfo (steg 1)
  const needsOnlyProfile = !profileComplete && tenant
  const [step, setStep] = useState(profileComplete ? 2 : 1)
  
  const [firstName, setFirstName] = useState(profile?.first_name || '')
  const [lastName, setLastName] = useState(profile?.last_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Invitation state
  const [pendingInvitation, setPendingInvitation] = useState(null)
  const [checkingInvitation, setCheckingInvitation] = useState(true)
  const [acceptingInvitation, setAcceptingInvitation] = useState(false)

  // Check for pending invitations when component mounts
  useEffect(() => {
    const checkInvitation = async () => {
      if (isDemoMode || !user?.email) {
        setCheckingInvitation(false)
        return
      }
      
      try {
        // First check URL token, then check for any pending invitation
        if (inviteToken) {
          const { data: invite } = await supabase
            .from('invitations')
            .select('*, tenants(name)')
            .eq('token', inviteToken)
            .eq('status', 'pending')
            .single()
          
          if (invite && new Date(invite.expires_at) > new Date()) {
            setPendingInvitation({
              ...invite,
              tenant_name: invite.tenants?.name
            })
          }
        } else {
          // Check if user has any pending invitation by email
          const { data: invite } = await supabase
            .from('invitations')
            .select('*, tenants(name)')
            .eq('email', user.email.toLowerCase())
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
          
          if (invite) {
            setPendingInvitation({
              ...invite,
              tenant_name: invite.tenants?.name
            })
          }
        }
      } catch (err) {
        // No invitation found, continue with normal flow
      }
      
      setCheckingInvitation(false)
    }
    
    checkInvitation()
  }, [user?.email, inviteToken])

  // Hvis profil allerede er komplett, hopp til steg 2
  useEffect(() => {
    if (profileComplete && step === 1 && !tenant && !pendingInvitation) {
      setStep(2)
    }
  }, [profileComplete, pendingInvitation])

  const handleStep1 = async (e) => {
    e.preventDefault()
    
    if (!firstName.trim() || !lastName.trim()) {
      setError('Vennligst fyll inn fornavn og etternavn')
      return
    }

    setLoading(true)
    setError('')

    const { error: updateError } = await updateProfile({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null
    })

    if (updateError) {
      setError('Kunne ikke lagre profil. Prøv igjen.')
      setLoading(false)
      return
    }

    setLoading(false)
    
    // Hvis bruker allerede har tenant, er vi ferdig (context vil oppdatere og navigere)
    if (tenant) {
      // Force re-render av appen ved å refreshe tenant
      return
    }
    
    // If there's a pending invitation, go to invitation step
    if (pendingInvitation) {
      setStep(3) // Invitation acceptance step
      return
    }
    
    setStep(2)
  }

  const handleAcceptInvitation = async () => {
    if (!pendingInvitation) return
    
    setAcceptingInvitation(true)
    setError('')
    
    try {
      // Update profile with tenant and role from invitation
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          tenant_id: pendingInvitation.tenant_id,
          role: pendingInvitation.role
        })
        .eq('id', user.id)
      
      if (updateError) throw updateError
      
      // Mark invitation as accepted
      await supabase
        .from('invitations')
        .update({ 
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', pendingInvitation.id)
      
      // Refresh tenant context to pick up the new tenant
      await refreshTenant()
      
      // The app should now redirect automatically
    } catch (err) {
      setError('Kunne ikke akseptere invitasjonen. Prøv igjen.')
      setAcceptingInvitation(false)
    }
  }

  const handleDeclineInvitation = () => {
    // Clear the invitation and proceed to create own company
    setPendingInvitation(null)
    setStep(2)
  }

  const handleStep2 = async (e) => {
    e.preventDefault()
    
    if (!companyName.trim()) {
      setError('Vennligst fyll inn bedriftsnavn')
      return
    }

    setLoading(true)
    setError('')

    const { error: createError } = await createTenant(companyName.trim())
    
    if (createError) {
      setError('Kunne ikke opprette bedrift. Prøv igjen.')
      setLoading(false)
    }
    // Hvis vellykket, vil TenantContext oppdatere tenant og appen vil rute videre automatisk
  }

  // Show loading while checking for invitations
  if (checkingInvitation) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-container">
          <div className="onboarding-header">
            <Loader2 size={48} className="spinner" style={{ margin: '0 auto' }} />
            <p style={{ marginTop: '1rem' }}>Laster...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-container">
        {step === 1 ? (
          <>
            <div className="onboarding-header">
              <div className="onboarding-icon">
                <User size={48} />
              </div>
              <h1>Velkommen!</h1>
              <p>Først trenger vi litt informasjon om deg.</p>
            </div>

            <form onSubmit={handleStep1} className="onboarding-form">
              {error && <div className="alert alert-error">{error}</div>}
              
              <Input
                label="Fornavn *"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ola"
                autoFocus
              />

              <Input
                label="Etternavn *"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Nordmann"
              />

              <Input
                label="Telefonnummer"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+47 XXX XX XXX"
              />

              <Button type="submit" disabled={loading} className="onboarding-btn">
                {loading ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    Lagrer...
                  </>
                ) : needsOnlyProfile ? (
                  <>
                    Fullfør
                    <ArrowRight size={18} />
                  </>
                ) : pendingInvitation ? (
                  <>
                    Neste
                    <ArrowRight size={18} />
                  </>
                ) : (
                  <>
                    Neste
                    <ArrowRight size={18} />
                  </>
                )}
              </Button>
            </form>
          </>
        ) : step === 3 && pendingInvitation ? (
          <>
            <div className="onboarding-header">
              <div className="onboarding-icon invitation-icon">
                <UserPlus size={48} />
              </div>
              <h1>Du er invitert!</h1>
              <p>Du har blitt invitert til å bli med i <strong>{pendingInvitation.tenant_name}</strong></p>
            </div>

            <div className="onboarding-form">
              {error && <div className="alert alert-error">{error}</div>}
              
              <div className="invitation-details">
                <div className="invitation-info">
                  <span className="label">Bedrift</span>
                  <span className="value">{pendingInvitation.tenant_name}</span>
                </div>
                <div className="invitation-info">
                  <span className="label">Din rolle</span>
                  <span className={`value role-badge role-${pendingInvitation.role}`}>
                    {pendingInvitation.role === 'admin' ? 'Administrator' : 'Medlem'}
                  </span>
                </div>
              </div>

              <Button 
                onClick={handleAcceptInvitation} 
                disabled={acceptingInvitation} 
                className="onboarding-btn"
              >
                {acceptingInvitation ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    Blir med...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Bli med i {pendingInvitation.tenant_name}
                  </>
                )}
              </Button>
              
              <button 
                type="button" 
                className="text-btn"
                onClick={handleDeclineInvitation}
              >
                Nei takk, jeg vil opprette min egen bedrift
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="onboarding-header">
              <div className="onboarding-icon">
                <Building2 size={48} />
              </div>
              <h1>Sett opp din bedrift</h1>
              <p>Nå trenger vi litt informasjon om bedriften din.</p>
            </div>

            <form onSubmit={handleStep2} className="onboarding-form">
              {error && <div className="alert alert-error">{error}</div>}
              
              <Input
                label="Bedriftsnavn *"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="F.eks. Min Bedrift AS"
                autoFocus
              />

              <Button type="submit" disabled={loading} className="onboarding-btn">
                {loading ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    Oppretter...
                  </>
                ) : (
                  <>
                    Kom i gang
                    <ArrowRight size={18} />
                  </>
                )}
              </Button>
            </form>
          </>
        )}

        {/* Bare vis step-indikator hvis bruker trenger begge steg */}
        {!needsOnlyProfile && (
          <div className="onboarding-steps">
            <span className={`step ${step >= 1 ? 'active' : ''}`}>1</span>
            <span className="step-line"></span>
            <span className={`step ${step >= 2 ? 'active' : ''}`}>2</span>
          </div>
        )}
      </div>
    </div>
  )
}
