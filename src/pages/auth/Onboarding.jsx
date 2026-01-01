import { useState, useEffect } from 'react'
import { Building2, ArrowRight, Loader2, User } from 'lucide-react'
import { useTenant } from '../../contexts/TenantContext'
import { Button, Input } from '../../components/common'
import './Auth.css'

export default function Onboarding() {
  const { createTenant, updateProfile, profile, tenant } = useTenant()
  
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

  // Hvis profil allerede er komplett, hopp til steg 2
  useEffect(() => {
    if (profileComplete && step === 1 && !tenant) {
      setStep(2)
    }
  }, [profileComplete])

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
                ) : (
                  <>
                    Neste
                    <ArrowRight size={18} />
                  </>
                )}
              </Button>
            </form>
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
