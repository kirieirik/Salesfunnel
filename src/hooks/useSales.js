import { useState, useEffect, useCallback } from 'react'
import { supabase, isDemoMode } from '../lib/supabase'
import { useTenant } from '../contexts/TenantContext'
import { demoSales, demoCustomers, generateId } from '../lib/demoData'

export function useSales(customerId = null) {
  const { tenant } = useTenant()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSales = useCallback(async () => {
    if (!tenant) {
      setSales([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    if (isDemoMode) {
      let filtered = demoSales.filter(s => s.tenant_id === tenant.id)
      if (customerId) {
        filtered = filtered.filter(s => s.customer_id === customerId)
      }
      setSales(filtered.sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date)))
      setLoading(false)
      return
    }

    try {
      let query = supabase
        .from('sales')
        .select(`
          *,
          customer:customers(id, name)
        `)
        .eq('tenant_id', tenant.id)
        .order('sale_date', { ascending: false })

      if (customerId) {
        query = query.eq('customer_id', customerId)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError
      setSales(data || [])
    } catch (err) {
      setError(err.message)
      setSales([])
    } finally {
      setLoading(false)
    }
  }, [tenant, customerId])

  useEffect(() => {
    fetchSales()
  }, [fetchSales])

  const createSale = async (saleData) => {
    if (!tenant) return { error: { message: 'Ingen tenant valgt' } }

    if (isDemoMode) {
      const customer = demoCustomers.find(c => c.id === saleData.customer_id)
      const newSale = {
        id: generateId(),
        ...saleData,
        tenant_id: tenant.id,
        created_at: new Date().toISOString(),
        customer: customer ? { id: customer.id, name: customer.name } : null,
      }
      setSales(prev => [newSale, ...prev])
      return { data: newSale, error: null }
    }

    try {
      const { data, error } = await supabase
        .from('sales')
        .insert({
          ...saleData,
          tenant_id: tenant.id
        })
        .select(`
          *,
          customer:customers(id, name)
        `)
        .single()

      if (error) throw error
      
      setSales(prev => [data, ...prev])
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  }

  const updateSale = async (id, updates) => {
    if (isDemoMode) {
      const updatedSale = { ...sales.find(s => s.id === id), ...updates }
      setSales(prev => prev.map(s => s.id === id ? updatedSale : s))
      return { data: updatedSale, error: null }
    }

    try {
      const { data, error } = await supabase
        .from('sales')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select(`
          *,
          customer:customers(id, name)
        `)
        .single()

      if (error) throw error
      
      setSales(prev => 
        prev.map(s => s.id === id ? data : s)
      )
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  }

  const deleteSale = async (id) => {
    if (isDemoMode) {
      setSales(prev => prev.filter(s => s.id !== id))
      return { error: null }
    }

    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id)

      if (error) throw error
      
      setSales(prev => prev.filter(s => s.id !== id))
      return { error: null }
    } catch (err) {
      return { error: err }
    }
  }

  // Statistikk-funksjoner
  const getSalesByMonth = useCallback(() => {
    const byMonth = {}
    sales.forEach(sale => {
      const month = sale.sale_date.substring(0, 7) // YYYY-MM
      byMonth[month] = (byMonth[month] || 0) + parseFloat(sale.amount)
    })
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total }))
  }, [sales])

  const getTotalSales = useCallback(() => {
    return sales.reduce((sum, sale) => sum + parseFloat(sale.amount), 0)
  }, [sales])

  const getTotalProfit = useCallback(() => {
    return sales.reduce((sum, sale) => sum + parseFloat(sale.profit || 0), 0)
  }, [sales])

  const getMarginPercent = useCallback(() => {
    const totalSales = getTotalSales()
    const totalProfit = getTotalProfit()
    if (totalSales === 0) return 0
    return (totalProfit / totalSales) * 100
  }, [getTotalSales, getTotalProfit])

  return {
    sales,
    loading,
    error,
    createSale,
    updateSale,
    deleteSale,
    refreshSales: fetchSales,
    getSalesByMonth,
    getTotalSales,
    getTotalProfit,
    getMarginPercent,
  }
}
