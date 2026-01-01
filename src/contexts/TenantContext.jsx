import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isDemoMode } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { demoTenant, demoUser, generateId } from '../lib/demoData'

const TenantContext = createContext({})

export const useTenant = () => useContext(TenantContext)

export function TenantProvider({ children }) {
  const { user } = useAuth()
  const [tenant, setTenant] = useState(isDemoMode ? demoTenant : null)
  const [profile, setProfile] = useState(isDemoMode ? demoUser : null)
  const [loading, setLoading] = useState(!isDemoMode)
  const [userRole, setUserRole] = useState(isDemoMode ? 'owner' : null)

  useEffect(() => {
    if (isDemoMode) return
    
    if (user) {
      fetchTenant()
    } else {
      setTenant(null)
      setUserRole(null)
      setLoading(false)
    }
  }, [user])

  const fetchTenant = async () => {
    if (isDemoMode) return
    
    setLoading(true)
    try {
      // Hent brukerens profil med tenant (forenklet struktur)
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          first_name,
          last_name,
          phone,
          role,
          tenant:tenants(*)
        `)
        .eq('id', user.id)
        .single()

      if (error) throw error

      if (profileData) {
        setProfile(profileData)
        if (profileData.tenant) {
          setTenant(profileData.tenant)
          setUserRole(profileData.role)
        }
      }
    } catch (error) {
      console.error('Error fetching tenant:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateProfile = async (updates) => {
    if (isDemoMode) {
      setProfile(prev => ({ ...prev, ...updates }))
      return { error: null }
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)

      if (error) throw error
      
      setProfile(prev => ({ ...prev, ...updates }))
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const createTenant = async (name) => {
    if (isDemoMode) {
      const newTenant = { id: generateId(), name, created_at: new Date().toISOString() }
      setTenant(newTenant)
      return { data: newTenant, error: null }
    }
    
    try {
      // Opprett ny tenant
      const { data: newTenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({ name })
        .select()
        .single()

      if (tenantError) throw tenantError

      // Oppdater brukerens profil med tenant og rolle
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          tenant_id: newTenant.id,
          role: 'owner'
        })
        .eq('id', user.id)

      if (profileError) throw profileError

      setTenant(newTenant)
      setUserRole('owner')
      return { data: newTenant, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  const value = {
    tenant,
    profile,
    userRole,
    loading,
    createTenant,
    updateProfile,
    refreshTenant: fetchTenant,
  }

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  )
}
