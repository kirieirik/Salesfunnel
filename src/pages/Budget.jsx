import { useState, useMemo, useEffect } from 'react'
import { TrendingUp, Edit2, Save, X, Plus } from 'lucide-react'
import { useCustomers } from '../hooks/useCustomers'
import { useSales } from '../hooks/useSales'
import { useTenant } from '../contexts/TenantContext'
import { supabase, isDemoMode } from '../lib/supabase'
import Card, { CardHeader, CardContent } from '../components/common/Card'
import { Button, Input } from '../components/common'
import './Budget.css'

export default function Budget() {
  const { tenant } = useTenant()
  const { sales } = useSales()
  const currentYear = new Date().getFullYear()
  const [budgets, setBudgets] = useState({}) // { '2026-01': { sales: 1000000, profit: 200000 }, ... }
  const [editingMonth, setEditingMonth] = useState(null)
  const [editValues, setEditValues] = useState({ sales: '', profit: '' })
  const [loading, setLoading] = useState(true)

  // Hent budsjett fra database
  useEffect(() => {
    if (!tenant) return
    fetchBudgets()
  }, [tenant])

  const fetchBudgets = async () => {
    if (isDemoMode) {
      // Demo-data
      const demoBudgets = JSON.parse(localStorage.getItem('demo_budgets') || '{}')
      setBudgets(demoBudgets)
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('tenant_id', tenant.id)

      if (error) throw error

      const budgetMap = {}
      data?.forEach(b => {
        budgetMap[b.month] = {
          sales: parseFloat(b.sales_budget || 0),
          profit: parseFloat(b.profit_budget || 0)
        }
      })
      setBudgets(budgetMap)
    } catch (err) {
      console.error('Feil ved lasting av budsjett:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveBudget = async (month, salesBudget, profitBudget) => {
    if (isDemoMode) {
      const updated = {
        ...budgets,
        [month]: { sales: parseFloat(salesBudget), profit: parseFloat(profitBudget) }
      }
      setBudgets(updated)
      localStorage.setItem('demo_budgets', JSON.stringify(updated))
      return
    }

    try {
      const { error } = await supabase
        .from('budgets')
        .upsert({
          tenant_id: tenant.id,
          month: month,
          sales_budget: parseFloat(salesBudget),
          profit_budget: parseFloat(profitBudget)
        }, {
          onConflict: 'tenant_id,month'
        })

      if (error) throw error

      setBudgets({
        ...budgets,
        [month]: { sales: parseFloat(salesBudget), profit: parseFloat(profitBudget) }
      })
    } catch (err) {
      console.error('Feil ved lagring av budsjett:', err)
      alert('Kunne ikke lagre budsjett: ' + err.message)
    }
  }

  const handleEdit = (month, currentSales, currentProfit) => {
    setEditingMonth(month)
    setEditValues({
      sales: currentSales || '',
      profit: currentProfit || ''
    })
  }

  const handleSave = async () => {
    await saveBudget(editingMonth, editValues.sales, editValues.profit)
    setEditingMonth(null)
  }

  const handleCancel = () => {
    setEditingMonth(null)
    setEditValues({ sales: '', profit: '' })
  }

  // Beregn sammenligning år-til-år med budsjett
  const yearComparison = useMemo(() => {
    const monthNames = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember']
    const previousYear = currentYear - 1

    // Grupper salg per måned
    const salesByMonthWithProfit = {}
    sales.forEach(sale => {
      if (!sale.sale_date) return
      const month = sale.sale_date.substring(0, 7)
      if (!salesByMonthWithProfit[month]) {
        salesByMonthWithProfit[month] = { amount: 0, profit: 0 }
      }
      salesByMonthWithProfit[month].amount += parseFloat(sale.amount || 0)
      salesByMonthWithProfit[month].profit += parseFloat(sale.profit || 0)
    })

    return monthNames.map((name, index) => {
      const monthNum = String(index + 1).padStart(2, '0')
      const currentYearKey = `${currentYear}-${monthNum}`
      const previousYearKey = `${previousYear}-${monthNum}`

      const currentYearData = salesByMonthWithProfit[currentYearKey] || { amount: 0, profit: 0 }
      const previousYearData = salesByMonthWithProfit[previousYearKey] || { amount: 0, profit: 0 }
      const budgetData = budgets[currentYearKey] || { sales: 0, profit: 0 }

      return {
        month: name,
        monthKey: currentYearKey,
        currentYear: {
          amount: currentYearData.amount,
          profit: currentYearData.profit
        },
        previousYear: {
          amount: previousYearData.amount,
          profit: previousYearData.profit
        },
        budget: {
          sales: budgetData.sales,
          profit: budgetData.profit
        }
      }
    })
  }, [sales, budgets, currentYear])

  // Beregn totale prognoser for året
  const yearSummary = useMemo(() => {
    let totalBudgetSales = 0
    let totalBudgetProfit = 0
    let totalPreviousYearSales = 0
    let totalPreviousYearProfit = 0

    yearComparison.forEach(month => {
      totalBudgetSales += month.budget.sales
      totalBudgetProfit += month.budget.profit
      totalPreviousYearSales += month.previousYear.amount
      totalPreviousYearProfit += month.previousYear.profit
    })

    const salesGrowth = totalPreviousYearSales > 0 
      ? ((totalBudgetSales - totalPreviousYearSales) / totalPreviousYearSales) * 100 
      : 0

    const profitGrowth = totalPreviousYearProfit > 0 
      ? ((totalBudgetProfit - totalPreviousYearProfit) / totalPreviousYearProfit) * 100 
      : 0

    return {
      budgetSales: totalBudgetSales,
      budgetProfit: totalBudgetProfit,
      previousYearSales: totalPreviousYearSales,
      previousYearProfit: totalPreviousYearProfit,
      salesGrowth,
      profitGrowth
    }
  }, [yearComparison])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const calculatePercentage = (actual, budget) => {
    if (!budget || budget === 0) return null
    const difference = actual - budget
    const percentage = (difference / budget) * 100
    return {
      value: Math.abs(percentage).toFixed(0),
      isPositive: difference >= 0
    }
  }

  if (!tenant) {
    return (
      <div className="budget-page">
        <div className="empty-state">
          <h2>Ingen organisasjon valgt</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="budget-page">
      <div className="page-header">
        <div>
          <h1>Budsjett {currentYear}</h1>
          <p>Sammenlign faktiske tall mot budsjett og fjoråret</p>
        </div>
      </div>

      {/* Prognose for året */}
      {yearSummary.budgetSales > 0 && (
        <Card className="forecast-card">
          <CardHeader>
            <h3>Prognose {currentYear}</h3>
          </CardHeader>
          <CardContent>
            <div className="forecast-grid">
              <div className="forecast-item">
                <span className="forecast-label">Budsjettert omsetning</span>
                <span className="forecast-value primary">{formatCurrency(yearSummary.budgetSales)}</span>
                <span className={`forecast-growth ${yearSummary.salesGrowth >= 0 ? 'positive' : 'negative'}`}>
                  {yearSummary.salesGrowth >= 0 ? '+' : ''}{yearSummary.salesGrowth.toFixed(1)}% fra {currentYear - 1}
                </span>
              </div>
              <div className="forecast-item">
                <span className="forecast-label">Budsjettert fortjeneste</span>
                <span className="forecast-value success">{formatCurrency(yearSummary.budgetProfit)}</span>
                <span className={`forecast-growth ${yearSummary.profitGrowth >= 0 ? 'positive' : 'negative'}`}>
                  {yearSummary.profitGrowth >= 0 ? '+' : ''}{yearSummary.profitGrowth.toFixed(1)}% fra {currentYear - 1}
                </span>
              </div>
              <div className="forecast-item">
                <span className="forecast-label">Faktisk {currentYear - 1} omsetning</span>
                <span className="forecast-value">{formatCurrency(yearSummary.previousYearSales)}</span>
              </div>
              <div className="forecast-item">
                <span className="forecast-label">Faktisk {currentYear - 1} fortjeneste</span>
                <span className="forecast-value">{formatCurrency(yearSummary.previousYearProfit)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="budget-card">
        <CardHeader>
          <h3>Månedlig oversikt</h3>
        </CardHeader>
        <CardContent>
          <div className="budget-table-wrapper">
            <table className="budget-table">
              <thead>
                <tr>
                  <th>Måned</th>
                  <th className="year-header">{currentYear}</th>
                  <th className="budget-header">Budsjett</th>
                  <th className="percentage-header">%</th>
                  <th className="previous-header">{currentYear - 1}</th>
                  <th className="actions-header"></th>
                </tr>
              </thead>
              <tbody>
                {yearComparison.map(({ month, monthKey, currentYear: current, previousYear: previous, budget }) => {
                  const isEditing = editingMonth === monthKey
                  const salesPercentage = calculatePercentage(current.amount, budget.sales)
                  const profitPercentage = calculatePercentage(current.profit, budget.profit)

                  return (
                    <tr key={monthKey} className="month-row">
                      <td className="month-cell">
                        <strong>{month}</strong>
                      </td>
                      
                      {/* Faktiske tall */}
                      <td className="actual-cell">
                        <div className="value-group">
                          <div className="value-row">
                            <span className="label">Omsetning:</span>
                            <span className="amount">{formatCurrency(current.amount)}</span>
                          </div>
                          <div className="value-row">
                            <span className="label">Fortjeneste:</span>
                            <span className="amount profit">{formatCurrency(current.profit)}</span>
                          </div>
                        </div>
                      </td>

                      {/* Budsjett */}
                      <td className="budget-cell">
                        {isEditing ? (
                          <div className="edit-group">
                            <Input
                              type="number"
                              placeholder="Omsetning"
                              value={editValues.sales}
                              onChange={(e) => setEditValues({ ...editValues, sales: e.target.value })}
                              className="budget-input"
                            />
                            <Input
                              type="number"
                              placeholder="Fortjeneste"
                              value={editValues.profit}
                              onChange={(e) => setEditValues({ ...editValues, profit: e.target.value })}
                              className="budget-input"
                            />
                          </div>
                        ) : (
                          <div className="value-group">
                            <div className="value-row">
                              <span className="amount">{budget.sales ? formatCurrency(budget.sales) : '-'}</span>
                            </div>
                            <div className="value-row">
                              <span className="amount profit">{budget.profit ? formatCurrency(budget.profit) : '-'}</span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Prosent av budsjett */}
                      <td className="percentage-cell">
                        <div className="value-group">
                          <div className="value-row">
                            {salesPercentage && (
                              <span className={`percentage ${salesPercentage.isPositive ? 'good' : 'warning'}`}>
                                {salesPercentage.isPositive ? '+' : '-'}{salesPercentage.value}%
                              </span>
                            )}
                          </div>
                          <div className="value-row">
                            {profitPercentage && (
                              <span className={`percentage ${profitPercentage.isPositive ? 'good' : 'warning'}`}>
                                {profitPercentage.isPositive ? '+' : '-'}{profitPercentage.value}%
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Fjoråret */}
                      <td className="previous-cell">
                        <div className="value-group">
                          <div className="value-row">
                            <span className="amount">{formatCurrency(previous.amount)}</span>
                          </div>
                          <div className="value-row">
                            <span className="amount profit">{formatCurrency(previous.profit)}</span>
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="actions-cell">
                        {isEditing ? (
                          <div className="action-buttons">
                            <Button size="sm" onClick={handleSave}>
                              <Save size={14} />
                            </Button>
                            <Button size="sm" variant="secondary" onClick={handleCancel}>
                              <X size={14} />
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            onClick={() => handleEdit(monthKey, budget.sales, budget.profit)}
                          >
                            {budget.sales || budget.profit ? <Edit2 size={14} /> : <Plus size={14} />}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
