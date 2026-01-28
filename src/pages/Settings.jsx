import { useState, useEffect } from 'react'
import { Building2, Users, Plus, Trash2, UserPlus, User, Save, Loader2, Mail, Check, X, RefreshCw } from 'lucide-react'
import { supabase, isDemoMode } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { Button, Input, Modal, Card, CardHeader, CardContent } from '../components/common'
import { demoMembers } from '../lib/demoData'
import './Settings.css'

export default function Settings() {
  const { user } = useAuth()
  const { tenant, profile, userRole, updateProfile } = useTenant()
  
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [pendingInvites, setPendingInvites] = useState([])
  const [inviteSuccess, setInviteSuccess] = useState('')

  // Profile edit state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)

  // Email sync state
  const [imapEmail, setImapEmail] = useState('')
  const [imapPassword, setImapPassword] = useState('')
  const [emailSyncEnabled, setEmailSyncEnabled] = useState(false)
  const [emailSyncStatus, setEmailSyncStatus] = useState('not_configured') // not_configured, testing, connected, error
  const [emailSyncError, setEmailSyncError] = useState('')
  const [emailSyncSaving, setEmailSyncSaving] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState(null)

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '')
      setLastName(profile.last_name || '')
      setPhone(profile.phone || '')
      // Load email sync settings
      setImapEmail(profile.imap_email || '')
      setEmailSyncEnabled(profile.email_sync_enabled || false)
      setLastSyncTime(profile.last_email_sync || null)
      if (profile.email_sync_enabled && profile.imap_email) {
        setEmailSyncStatus('connected')
      }
    }
  }, [profile])

  const fetchMembers = async () => {
    if (!tenant) return
    
    if (isDemoMode) {
      setMembers(demoMembers.filter(m => m.tenant_id === tenant.id))
      return
    }
    
    setLoadingMembers(true)
    
    // Fetch members
    const { data: memberData, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, role')
      .eq('tenant_id', tenant.id)

    if (!error) {
      setMembers(memberData || [])
    }
    
    // Fetch pending invitations
    const { data: inviteData } = await supabase
      .from('invitations')
      .select('id, email, role, created_at, expires_at')
      .eq('tenant_id', tenant.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    
    if (inviteData) {
      setPendingInvites(inviteData)
    }
    
    setLoadingMembers(false)
  }

  useEffect(() => {
    fetchMembers()
  }, [tenant])

  const handleInvite = async (e) => {
    e.preventDefault()
    setError('')
    setInviteSuccess('')
    setLoading(true)

    if (isDemoMode) {
      setError('Invitasjon er deaktivert i demo-modus')
      setLoading(false)
      return
    }

    try {
      // Call Edge Function to send invitation
      const { data, error: inviteError } = await supabase.functions.invoke('send-invite', {
        body: {
          email: inviteEmail.toLowerCase().trim(),
          role: inviteRole
        }
      })

      if (inviteError) {
        throw new Error(inviteError.message || 'Kunne ikke sende invitasjon')
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Kunne ikke sende invitasjon')
      }

      setInviteSuccess(`Invitasjon sendt til ${inviteEmail}`)
      setInviteEmail('')
      setShowInvite(false)
      fetchMembers() // Refresh members and pending invites
      
      // Clear success message after 5 seconds
      setTimeout(() => setInviteSuccess(''), 5000)
    } catch (err) {
      setError(err.message || 'Noe gikk galt')
    }
    
    setLoading(false)
  }

  const handleCancelInvite = async (inviteId) => {
    if (!confirm('Er du sikker på at du vil avbryte denne invitasjonen?')) return

    const { error } = await supabase
      .from('invitations')
      .update({ status: 'cancelled' })
      .eq('id', inviteId)

    if (!error) {
      fetchMembers()
    }
  }

  const handleRemoveMember = async (memberId) => {
    if (!confirm('Er du sikker på at du vil fjerne dette medlemmet?')) return

    // Remove the user from this tenant by clearing their tenant_id
    const { error } = await supabase
      .from('profiles')
      .update({ tenant_id: null, role: null })
      .eq('id', memberId)

    if (!error) {
      fetchMembers()
    }
  }

  const canManageMembers = userRole === 'owner' || userRole === 'admin'

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setProfileSaving(true)
    setProfileSuccess(false)

    const { error } = await updateProfile({
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      phone: phone.trim() || null
    })

    setProfileSaving(false)
    if (!error) {
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    }
  }

  // Test IMAP connection and save credentials
  const handleTestEmailConnection = async () => {
    if (!imapEmail || !imapPassword) {
      setEmailSyncError('Fyll inn e-post og passord')
      return
    }

    setEmailSyncSaving(true)
    setEmailSyncStatus('testing')
    setEmailSyncError('')

    try {
      // Call Edge Function to test IMAP connection
      console.log('Calling test-imap-connection...')
      const { data, error } = await supabase.functions.invoke('test-imap-connection', {
        body: {
          email: imapEmail,
          password: imapPassword,
          server: 'mail.uniweb.no',
          port: 993
        }
      })

      console.log('Response:', { data, error })

      if (error) {
        console.error('Function error:', error)
        throw new Error(error.message || 'Kunne ikke nå e-posttjenesten')
      }

      if (!data) {
        throw new Error('Ingen respons fra serveren')
      }

      if (data.success) {
        // Save credentials to profile (password will be encrypted by Edge Function)
        console.log('Test successful, saving profile...')
        const { error: saveError } = await updateProfile({
          imap_email: imapEmail,
          email_sync_enabled: true
        })

        if (saveError) {
          console.error('Profile save error:', saveError)
          throw saveError
        }

        // Store encrypted password separately via Edge Function
        console.log('Calling save-imap-credentials...')
        const { data: saveData, error: saveCredsError } = await supabase.functions.invoke('save-imap-credentials', {
          body: {
            email: imapEmail,
            password: imapPassword
          }
        })
        
        console.log('save-imap-credentials response:', { saveData, saveCredsError })
        
        if (saveCredsError) {
          console.error('Save credentials error:', saveCredsError)
          throw new Error('Kunne ikke lagre e-postinnstillinger')
        }
        
        if (saveData && !saveData.success) {
          console.error('Save credentials failed:', saveData.error)
          throw new Error(saveData.error || 'Kunne ikke lagre e-postinnstillinger')
        }

        setEmailSyncStatus('connected')
        setEmailSyncEnabled(true)
        setImapPassword('') // Clear password from form
        console.log('Email sync setup complete!')
      } else {
        throw new Error(data.error || 'Kunne ikke koble til e-postserveren')
      }
    } catch (err) {
      console.error('Setup error:', err)
      setEmailSyncStatus('error')
      setEmailSyncError(err.message || 'Tilkobling feilet')
    }

    setEmailSyncSaving(false)
  }

  // Disable email sync
  const handleDisableEmailSync = async () => {
    if (!confirm('Er du sikker på at du vil deaktivere e-postsynkronisering?')) return

    setEmailSyncSaving(true)
    
    try {
      const { error } = await updateProfile({
        email_sync_enabled: false,
        imap_email: null
      })

      if (error) throw error

      // Clear credentials via Edge Function
      await supabase.functions.invoke('clear-imap-credentials', {})

      setEmailSyncStatus('not_configured')
      setEmailSyncEnabled(false)
      setImapEmail('')
      setImapPassword('')
    } catch (err) {
      setEmailSyncError(err.message)
    }

    setEmailSyncSaving(false)
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Innstillinger</h1>
      </div>

      <div className="settings-grid">
        {/* Current Organization */}
        {tenant && (
          <Card>
            <CardHeader>
              <h3>
                <Building2 size={20} />
                Bedrift
              </h3>
            </CardHeader>
            <CardContent>
              <div className="org-info">
                <div className="info-row">
                  <label>Bedriftsnavn</label>
                  <span>{tenant.name}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Members */}
        {tenant && (
          <Card>
            <CardHeader>
              <h3>
                <Users size={20} />
                Medlemmer i {tenant.name}
              </h3>
              {canManageMembers && (
                <Button size="sm" onClick={() => setShowInvite(true)}>
                  <UserPlus size={16} />
                  Inviter
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {inviteSuccess && (
                <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                  <Check size={16} />
                  {inviteSuccess}
                </div>
              )}
              
              {loadingMembers ? (
                <p>Laster medlemmer...</p>
              ) : (
                <>
                  <ul className="members-list">
                    {members.map(member => (
                      <li key={member.id}>
                        <div className="member-info">
                          <span className="email">
                            {member.first_name && member.last_name 
                              ? `${member.first_name} ${member.last_name}` 
                              : member.email}
                          </span>
                          <span className={`role role-${member.role}`}>{member.role}</span>
                        </div>
                        {canManageMembers && member.id !== user.id && member.role !== 'owner' && (
                          <button 
                            className="btn-icon danger"
                            onClick={() => handleRemoveMember(member.id)}
                            title="Fjern medlem"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  
                  {/* Pending Invitations */}
                  {pendingInvites.length > 0 && (
                    <div className="pending-invites">
                      <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                        <Mail size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                        Ventende invitasjoner
                      </h4>
                      <ul className="members-list">
                        {pendingInvites.map(invite => (
                          <li key={invite.id} className="pending-invite">
                            <div className="member-info">
                              <span className="email">{invite.email}</span>
                              <span className={`role role-${invite.role}`}>{invite.role}</span>
                              <span className="pending-badge">Venter</span>
                            </div>
                            {canManageMembers && (
                              <button 
                                className="btn-icon danger"
                                onClick={() => handleCancelInvite(invite.id)}
                                title="Avbryt invitasjon"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Profile */}
        <Card>
          <CardHeader>
            <h3>
              <User size={20} />
              Min profil
            </h3>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="profile-form">
              {profileSuccess && <div className="alert alert-success">Profil oppdatert!</div>}
              
              <div className="profile-form-grid">
                <Input
                  label="Fornavn"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Ola"
                />
                <Input
                  label="Etternavn"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Nordmann"
                />
              </div>

              <Input
                label="Telefonnummer"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+47 XXX XX XXX"
              />

              <div className="info-row">
                <label>E-post</label>
                <span>{user?.email}</span>
              </div>
              
              <div className="info-row">
                <label>Rolle i {tenant?.name}</label>
                <span className={`role role-${userRole}`}>{userRole || 'Ingen'}</span>
              </div>

              <Button type="submit" disabled={profileSaving} className="profile-save-btn">
                {profileSaving ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    Lagrer...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Lagre endringer
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Email Sync */}
        <Card className="email-sync-card">
          <CardHeader>
            <h3>
              <Mail size={20} />
              E-postsynkronisering
            </h3>
            {emailSyncStatus === 'connected' && (
              <span className="sync-status connected">
                <Check size={16} />
                Tilkoblet
              </span>
            )}
          </CardHeader>
          <CardContent>
            <p className="email-sync-description">
              Koble til din e-post for å automatisk logge all korrespondanse med kunder på deres kundekort.
            </p>

            {emailSyncStatus === 'connected' ? (
              <div className="email-sync-active">
                <div className="sync-info">
                  <div className="sync-email">
                    <Mail size={16} />
                    <span>{imapEmail || profile?.imap_email}</span>
                  </div>
                  {lastSyncTime && (
                    <p className="last-sync">
                      Sist synkronisert: {new Date(lastSyncTime).toLocaleString('nb-NO')}
                    </p>
                  )}
                </div>
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={handleDisableEmailSync}
                  disabled={emailSyncSaving}
                >
                  <X size={16} />
                  Deaktiver
                </Button>
              </div>
            ) : (
              <div className="email-sync-setup">
                <div className="imap-server-info">
                  <p><strong>Server:</strong> mail.uniweb.no</p>
                  <p><strong>Port:</strong> 143 (STARTTLS)</p>
                </div>

                {emailSyncError && (
                  <div className="alert alert-error">{emailSyncError}</div>
                )}

                <Input
                  label="E-postadresse"
                  type="email"
                  value={imapEmail}
                  onChange={(e) => setImapEmail(e.target.value)}
                  placeholder="din@epost.no"
                />

                <Input
                  label="Passord"
                  type="password"
                  value={imapPassword}
                  onChange={(e) => setImapPassword(e.target.value)}
                  placeholder="••••••••"
                />

                <Button 
                  onClick={handleTestEmailConnection}
                  disabled={emailSyncSaving || !imapEmail || !imapPassword}
                >
                  {emailSyncSaving ? (
                    <>
                      <Loader2 size={16} className="spinner" />
                      {emailSyncStatus === 'testing' ? 'Tester tilkobling...' : 'Lagrer...'}
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      Test og aktiver
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invite Modal */}
      <Modal
        isOpen={showInvite}
        onClose={() => setShowInvite(false)}
        title="Inviter medlem"
      >
        <form onSubmit={handleInvite}>
          {error && <div className="alert alert-error">{error}</div>}
          <Input
            label="E-post"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <div className="input-group">
            <label>Rolle</label>
            <select 
              value={inviteRole} 
              onChange={(e) => setInviteRole(e.target.value)}
              className="input"
            >
              <option value="member">Medlem</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowInvite(false)}>
              Avbryt
            </Button>
            <Button type="submit" loading={loading}>
              Send invitasjon
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
