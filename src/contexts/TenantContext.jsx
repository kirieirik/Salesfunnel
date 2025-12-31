import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isDemoMode } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { demoTenant, generateId } from '../lib/demoData'

const TenantContext = createContext({})

export const useTenant = () => useContext(TenantContext)

export function TenantProvider({ children }) {
  const { user } = useAuth()
  const [tenant, setTenant] = useState(isDemoMode ? demoTenant : null)
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
      // Hent brukerens tenant (én per bruker)
      const { data: membership, error } = await supabase
        .from('tenant_members')
        .select(`
          role,
          tenant:tenants(*)
        `)
        .eq('user_id', user.id)
        .single()

      if (error) throw error

      if (membership?.tenant) {
        setTenant(membership.tenant)
        setUserRole(membership.role)
      }
    } catch (error) {
      console.error('Error fetching tenant:', error)
    } finally {
      setLoading(false)
    }
  }

  const createTenant = async (name) => {
    if (isDemoMode) {
      const newTenant = { id: generateId(), name, created_at: new Date().toISOString() }
      setTenant(newTenant)
      return { data: newTenant, error: null }
    }
    
    try {
      const { data: newTenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({ name })
        .select()
        .single()

      if (tenantError) throw tenantError

      // Legg til bruker som owner
      const { error: memberError } = await supabase
        .from('tenant_members')
        .insert({
          tenant_id: newTenant.id,
          user_id: user.id,
          role: 'owner'
        })

      if (memberError) throw memberError

      setTenant(newTenant)
      setUserRole('owner')
      return { data: newTenant, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  const value = {
    tenant,
    userRole,
    loading,
    createTenant,
    refreshTenant: fetchTenant,
  }

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  )
}
