import { useState, useEffect } from 'react'
import { Building2, Users, Plus, Trash2, UserPlus } from 'lucide-react'
import { supabase, isDemoMode } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTenant } from '../contexts/TenantContext'
import { Button, Input, Modal, Card, CardHeader, CardContent } from '../components/common'
import { demoMembers } from '../lib/demoData'

export default function Settings() {
  const { user } = useAuth()
  const { tenant, organizations, createOrganization, userRole, refreshOrganizations } = useTenant()
  
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  const fetchMembers = async () => {
    if (!tenant) return
    
    if (isDemoMode) {
      setMembers(demoMembers.filter(m => m.tenant_id === tenant.id))
      return
    }
    
    setLoadingMembers(true)
    const { data, error } = await supabase
      .from('tenant_members')
      .select(`
        id,
        role,
        created_at,
        user:user_id(id, email)
      `)
      .eq('tenant_id', tenant.id)

    if (!error) {
      setMembers(data || [])
    }
    setLoadingMembers(false)
  }

  useEffect(() => {
    fetchMembers()
  }, [tenant])

  const handleCreateOrg = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await createOrganization(newOrgName)
    
    if (error) {
      setError(error.message)
    } else {
      setNewOrgName('')
      setShowNewOrg(false)
    }
    setLoading(false)
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (isDemoMode) {
      setError('Invitasjon er deaktivert i demo-modus')
      setLoading(false)
      return
    }

    // For nå - forenklet invitasjon (bruker må allerede eksistere)
    const { data: invitedUser, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', inviteEmail)
      .single()

    if (userError || !invitedUser) {
      setError('Bruker med denne e-posten finnes ikke')
      setLoading(false)
      return
    }

    const { error: memberError } = await supabase
      .from('tenant_members')
      .insert({
        tenant_id: tenant.id,
        user_id: invitedUser.id,
        role: inviteRole
      })

    if (memberError) {
      if (memberError.code === '23505') {
        setError('Brukeren er allerede medlem av organisasjonen')
      } else {
        setError(memberError.message)
      }
    } else {
      setInviteEmail('')
      setShowInvite(false)
      fetchMembers()
    }
    setLoading(false)
  }

  const handleRemoveMember = async (memberId) => {
    if (!confirm('Er du sikker på at du vil fjerne dette medlemmet?')) return

    const { error } = await supabase
      .from('org_members')
      .delete()
      .eq('id', memberId)

    if (!error) {
      fetchMembers()
    }
  }

  const canManageMembers = userRole === 'owner' || userRole === 'admin'

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Innstillinger</h1>
      </div>

      <div className="settings-grid">
        {/* Organizations */}
        <Card>
          <CardHeader>
            <h3>
              <Building2 size={20} />
              Organisasjoner
            </h3>
            <Button size="sm" onClick={() => setShowNewOrg(true)}>
              <Plus size={16} />
              Ny
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="org-list">
              {organizations.map(org => (
                <li key={org.id} className={org.id === tenant?.id ? 'active' : ''}>
                  <span>{org.name}</span>
                  {org.id === tenant?.id && <span className="badge">Aktiv</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

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
              {loadingMembers ? (
                <p>Laster medlemmer...</p>
              ) : (
                <ul className="members-list">
                  {members.map(member => (
                    <li key={member.id}>
                      <div className="member-info">
                        <span className="email">{member.user?.email || 'Ukjent'}</span>
                        <span className={`role role-${member.role}`}>{member.role}</span>
                      </div>
                      {canManageMembers && member.user?.id !== user.id && (
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
              )}
            </CardContent>
          </Card>
        )}

        {/* Profile */}
        <Card>
          <CardHeader>
            <h3>Min profil</h3>
          </CardHeader>
          <CardContent>
            <div className="profile-info">
              <div className="info-row">
                <label>E-post</label>
                <span>{user?.email}</span>
              </div>
              <div className="info-row">
                <label>Rolle i {tenant?.name}</label>
                <span className={`role role-${userRole}`}>{userRole || 'Ingen'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* New Org Modal */}
      <Modal
        isOpen={showNewOrg}
        onClose={() => setShowNewOrg(false)}
        title="Ny organisasjon"
      >
        <form onSubmit={handleCreateOrg}>
          {error && <div className="alert alert-error">{error}</div>}
          <Input
            label="Organisasjonsnavn"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            required
          />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowNewOrg(false)}>
              Avbryt
            </Button>
            <Button type="submit" loading={loading}>
              Opprett
            </Button>
          </div>
        </form>
      </Modal>

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
