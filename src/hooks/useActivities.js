import { useState, useEffect, useCallback } from 'react'
import { supabase, isDemoMode } from '../lib/supabase'
import { useTenant } from '../contexts/TenantContext'
import { demoActivities, demoCustomers, generateId } from '../lib/demoData'

export function useActivities(customerId = null) {
  const { tenant } = useTenant()
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchActivities = useCallback(async () => {
    if (!tenant) {
      setActivities([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    if (isDemoMode) {
      let filtered = demoActivities.filter(a => a.tenant_id === tenant.id)
      if (customerId) {
        filtered = filtered.filter(a => a.customer_id === customerId)
      }
      setActivities(filtered.sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date)))
      setLoading(false)
      return
    }

    try {
      let query = supabase
        .from('activities')
        .select(`
          *,
          customer:customers(id, name)
        `)
        .eq('tenant_id', tenant.id)
        .order('activity_date', { ascending: false })

      if (customerId) {
        query = query.eq('customer_id', customerId)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError
      setActivities(data || [])
    } catch (err) {
      setError(err.message)
      setActivities([])
    } finally {
      setLoading(false)
    }
  }, [tenant, customerId])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  const createActivity = async (activityData) => {
    if (!tenant) return { error: { message: 'Ingen tenant valgt' } }

    if (isDemoMode) {
      const customer = demoCustomers.find(c => c.id === activityData.customer_id)
      const newActivity = {
        id: generateId(),
        ...activityData,
        tenant_id: tenant.id,
        created_at: new Date().toISOString(),
        customer: customer ? { id: customer.id, name: customer.name } : null,
      }
      setActivities(prev => [newActivity, ...prev])
      return { data: newActivity, error: null }
    }

    try {
      const { data, error } = await supabase
        .from('activities')
        .insert({
          ...activityData,
          tenant_id: tenant.id
        })
        .select(`
          *,
          customer:customers(id, name)
        `)
        .single()

      if (error) throw error
      
      setActivities(prev => [data, ...prev])
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  }

  const updateActivity = async (id, updates) => {
    if (isDemoMode) {
      const updatedActivity = { ...activities.find(a => a.id === id), ...updates }
      setActivities(prev => prev.map(a => a.id === id ? updatedActivity : a))
      return { data: updatedActivity, error: null }
    }

    try {
      const { data, error } = await supabase
        .from('activities')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select(`
          *,
          customer:customers(id, name)
        `)
        .single()

      if (error) throw error
      
      setActivities(prev => 
        prev.map(a => a.id === id ? data : a)
      )
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  }

  const deleteActivity = async (id) => {
    if (isDemoMode) {
      setActivities(prev => prev.filter(a => a.id !== id))
      return { error: null }
    }

    try {
      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id)

      if (error) throw error
      
      setActivities(prev => prev.filter(a => a.id !== id))
      return { error: null }
    } catch (err) {
      return { error: err }
    }
  }

  return {
    activities,
    loading,
    error,
    createActivity,
    updateActivity,
    deleteActivity,
    refreshActivities: fetchActivities,
  }
}
