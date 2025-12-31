import { useState, useEffect, useCallback } from 'react'
import { supabase, isDemoMode } from '../lib/supabase'
import { useTenant } from '../contexts/TenantContext'
import { demoCustomers, generateId } from '../lib/demoData'
import { fetchCompanyData } from '../lib/brreg'

// Nøkkel for å lagre sist synkroniseringstidspunkt
const SYNC_KEY = 'salesfunnel_last_brreg_sync'
const SYNC_INTERVAL = 24 * 60 * 60 * 1000 // 24 timer

export function useCustomers() {
  const { tenant } = useTenant()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCustomers = useCallback(async () => {
    if (!tenant) {
      setCustomers([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    if (isDemoMode) {
      const filtered = demoCustomers.filter(c => c.tenant_id === tenant.id)
      setCustomers(filtered)
      setLoading(false)
      return
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name')

      if (fetchError) throw fetchError
      setCustomers(data || [])
    } catch (err) {
      setError(err.message)
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }, [tenant])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  const createCustomer = async (customerData) => {
    if (!tenant) return { error: { message: 'Ingen tenant valgt' } }

    if (isDemoMode) {
      const newCustomer = {
        id: generateId(),
        ...customerData,
        tenant_id: tenant.id,
        created_at: new Date().toISOString(),
      }
      setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)))
      return { data: newCustomer, error: null }
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          ...customerData,
          tenant_id: tenant.id
        })
        .select()
        .single()

      if (error) throw error
      
      setCustomers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  }

  const updateCustomer = async (id, updates) => {
    if (isDemoMode) {
      const updatedCustomer = { ...customers.find(c => c.id === id), ...updates }
      setCustomers(prev => prev.map(c => c.id === id ? updatedCustomer : c))
      return { data: updatedCustomer, error: null }
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select()
        .single()

      if (error) throw error
      
      setCustomers(prev => 
        prev.map(c => c.id === id ? data : c)
      )
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  }

  const deleteCustomer = async (id) => {
    if (isDemoMode) {
      setCustomers(prev => prev.filter(c => c.id !== id))
      return { error: null }
    }

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id)

      if (error) throw error
      
      setCustomers(prev => prev.filter(c => c.id !== id))
      return { error: null }
    } catch (err) {
      return { error: err }
    }
  }

  const importCustomers = async (customersArray) => {
    if (!tenant) return { error: { message: 'Ingen tenant valgt' } }

    if (isDemoMode) {
      const newCustomers = customersArray.map(c => ({
        id: generateId(),
        ...c,
        tenant_id: tenant.id,
        created_at: new Date().toISOString(),
      }))
      setCustomers(prev => [...prev, ...newCustomers].sort((a, b) => a.name.localeCompare(b.name)))
      return { data: newCustomers, error: null }
    }

    try {
      const customersWithTenant = customersArray.map(c => ({
        ...c,
        tenant_id: tenant.id
      }))

      const { data, error } = await supabase
        .from('customers')
        .insert(customersWithTenant)
        .select()

      if (error) throw error
      
      await fetchCustomers() // Refresh full liste
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  }

  // Synkroniser en enkelt kunde fra Brønnøysund
  const syncCustomerFromBrreg = async (customer) => {
    if (!customer.org_nr) return { data: null, error: { message: 'Ingen org.nr' } }
    
    const brregData = await fetchCompanyData(customer.org_nr)
    if (!brregData) return { data: null, error: { message: 'Fant ikke bedrift i Brønnøysund' } }
    
    // Oppdater kun Brønnøysund-feltene, behold brukerens egne data
    const updates = {
      name: brregData.name,
      address: brregData.address,
      postal_code: brregData.postal_code,
      city: brregData.city,
      industry: brregData.industry,
      employee_count: brregData.employee_count,
      website: brregData.website || customer.website, // Behold eksisterende hvis Brreg ikke har
      brreg_updated_at: new Date().toISOString()
    }
    
    return await updateCustomer(customer.id, updates)
  }

  // Synkroniser alle kunder med org.nr fra Brønnøysund
  const syncAllCustomersFromBrreg = async (force = false) => {
    const lastSync = localStorage.getItem(SYNC_KEY)
    const now = Date.now()
    
    // Sjekk om vi skal synkronisere (med mindre force er true)
    if (!force && lastSync && (now - parseInt(lastSync)) < SYNC_INTERVAL) {
      console.log('Brønnøysund-synkronisering: Ikke behov for synkronisering ennå')
      return { synced: 0, skipped: customers.length }
    }
    
    let synced = 0
    let failed = 0
    
    // Filtrer kunder som har org.nr
    const customersWithOrgNr = customers.filter(c => c.org_nr && c.org_nr.trim() !== '')
    
    for (const customer of customersWithOrgNr) {
      try {
        const { error } = await syncCustomerFromBrreg(customer)
        if (!error) {
          synced++
        } else {
          failed++
        }
        // Litt delay for å ikke overbelaste API
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (err) {
        failed++
      }
    }
    
    // Lagre synkroniseringstidspunkt
    localStorage.setItem(SYNC_KEY, now.toString())
    
    return { synced, failed, total: customersWithOrgNr.length }
  }

  // Auto-synkronisering ved oppstart
  useEffect(() => {
    if (customers.length > 0) {
      syncAllCustomersFromBrreg(false)
    }
  }, [customers.length > 0]) // Kjør når vi har kunder

  return {
    customers,
    loading,
    error,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    importCustomers,
    refreshCustomers: fetchCustomers,
    syncCustomerFromBrreg,
    syncAllCustomersFromBrreg,
  }
}
