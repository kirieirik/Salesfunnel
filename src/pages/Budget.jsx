import { useState, useMemo, useEffect } from 'react'
import { TrendingUp, Edit2, Save, X, Plus, Percent } from 'lucide-react'
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
  const [budgets, setBudgets] = useState({})
  const [defaultProfitPercent, setDefaultProfitPercent] = useState('')
  const [defaultPercentInput, setDefaultPercentInput] = useState('')
  const [editingMonth, setEditingMonth] = useState(null)
  const [editValues, setEditValues] = useState({ sales: '', profitPercent: '' })
  const [loading, setLoading] = useState(true)

  // Hent budsjett fra database
  useEffect(() => {
    if (!tenant) return
    fetchBudgets()
  }, [tenant])

  const fetchBudgets = async () => {
    if (isDemoMode) {
      const demoBudgets = JSON.parse(localStorage.getItem('demo_budgets') || '{}')
      // Migrer gammel absolutt fortjeneste til prosent i demo-data
      Object.entries(demoBudgets).forEach(([key, val]) => {
        if (key !== 'default' && val.profit && !val.profitPercent && val.sales > 0) {
          val.profitPercent = Math.round((val.profit / val.sales) * 100 * 10) / 10
          delete val.profit
        }
      })
      setBudgets(demoBudgets)
      if (demoBudgets['default']?.profitPercent) {
        setDefaultProfitPercent(demoBudgets['default'].profitPercent)
        setDefaultPercentInput(String(demoBudgets['default'].profitPercent))
      }
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
      let defaultPercent = ''
      data?.forEach(b => {
        if (b.month === 'default') {
          defaultPercent = parseFloat(b.profit_budget || 0)
          budgetMap['default'] = { profitPercent: defaultPercent }
        } else {
          const salesVal = parseFloat(b.sales_budget || 0)
          let profitVal = parseFloat(b.profit_budget || 0)
          // Migrer gammel absolutt fortjeneste til prosent
          if (profitVal > 100 && salesVal > 0) {
            profitVal = Math.round((profitVal / salesVal) * 100 * 10) / 10
          }
          budgetMap[b.month] = {
            sales: salesVal,
            profitPercent: profitVal
          }
        }
      })
      setBudgets(budgetMap)
      if (defaultPercent !== '') {
        setDefaultProfitPercent(defaultPercent)
        setDefaultPercentInput(String(defaultPercent))
      }
    } catch (err) {
      console.error('Feil ved lasting av budsjett:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveBudget = async (month, salesBudget, profitPercent) => {
    const parsedSales = parseFloat(salesBudget) || 0
    const parsedPercent = parseFloat(profitPercent) || 0

    if (isDemoMode) {
      const updated = {
        ...budgets,
        [month]: { sales: parsedSales, profitPercent: parsedPercent }
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
          sales_budget: parsedSales,
          profit_budget: parsedPercent
        }, {
          onConflict: 'tenant_id,month'
        })

      if (error) throw error

      setBudgets(prev => ({
        ...prev,
        [month]: { sales: parsedSales, profitPercent: parsedPercent }
      }))
    } catch (err) {
      console.error('Feil ved lagring av budsjett:', err)
      alert('Kunne ikke lagre budsjett: ' + err.message)
    }
  }

  const applyDefaultToAll = async () => {
    const percent = parseFloat(defaultPercentInput)
    if (isNaN(percent)) return

    setDefaultProfitPercent(percent)

    if (isDemoMode) {
      const updated = { ...budgets, default: { profitPercent: percent } }
      Object.keys(updated).forEach(key => {
        if (key !== 'default' && updated[key].sales) {
          updated[key].profitPercent = percent
        }
      })
      setBudgets(updated)
      localStorage.setItem('demo_budgets', JSON.stringify(updated))
      return
    }

    try {
      const upsertData = [{
        tenant_id: tenant.id,
        month: 'default',
        sales_budget: 0,
        profit_budget: percent
      }]

      Object.entries(budgets).forEach(([month, data]) => {
        if (month !== 'default' && data.sales) {
          upsertData.push({
            tenant_id: tenant.id,
            month,
            sales_budget: data.sales,
            profit_budget: percent
          })
        }
      })

      const { error } = await supabase
        .from('budgets')
        .upsert(upsertData, { onConflict: 'tenant_id,month' })

      if (error) throw error

      const updated = { ...budgets, default: { profitPercent: percent } }
      Object.keys(updated).forEach(key => {
        if (key !== 'default' && updated[key].sales) {
          updated[key].profitPercent = percent
        }
      })
      setBudgets(updated)
    } catch (err) {
      console.error('Feil ved lagring av standard prosent:', err)
      alert('Kunne ikke lagre: ' + err.message)
    }
  }

  const handleEdit = (month, currentSales, currentProfitPercent) => {
    setEditingMonth(month)
    setEditValues({
      sales: currentSales || '',
      profitPercent: currentProfitPercent || defaultProfitPercent || ''
    })
  }

  const handleSave = async () => {
    await saveBudget(editingMonth, editValues.sales, editValues.profitPercent)
    setEditingMonth(null)
  }

  const handleCancel = () => {
    setEditingMonth(null)
    setEditValues({ sales: '', profitPercent: '' })
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
      const budgetData = budgets[currentYearKey]
      const effectivePercent = budgetData?.profitPercent ?? (parseFloat(defaultProfitPercent) || 0)
      const budgetSales = budgetData?.sales || 0
      const calculatedProfit = budgetSales * effectivePercent / 100

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
          sales: budgetSales,
          profitPercent: effectivePercent,
          profit: calculatedProfit
        }
      }
    })
  }, [sales, budgets, currentYear, defaultProfitPercent])

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

      {/* Standard fortjenesteprosent */}
      <Card className="default-percent-card">
        <CardContent>
          <div className="default-percent-section">
            <div className="default-percent-info">
              <Percent size={20} />
              <div>
                <span className="default-percent-label">Standard fortjeneste %</span>
                <span className="default-percent-desc">Sett en standard fortjenesteprosent som brukes for alle måneder</span>
              </div>
            </div>
            <div className="default-percent-controls">
              <Input
                type="number"
                placeholder="F.eks. 20"
                value={defaultPercentInput}
                onChange={(e) => setDefaultPercentInput(e.target.value)}
                className="default-percent-input"
                min="0"
                max="100"
                step="0.1"
              />
              <span className="percent-symbol">%</span>
              <Button onClick={applyDefaultToAll} disabled={!defaultPercentInput}>
                Bruk på alle måneder
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* Desktop: Table view */}
      <Card className="budget-card budget-desktop">
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
                            <div className="percent-input-group">
                              <Input
                                type="number"
                                placeholder="Fortjeneste %"
                                value={editValues.profitPercent}
                                onChange={(e) => setEditValues({ ...editValues, profitPercent: e.target.value })}
                                className="budget-input"
                                min="0"
                                max="100"
                                step="0.1"
                              />
                              <span className="percent-symbol">%</span>
                            </div>
                            {editValues.sales && editValues.profitPercent && (
                              <span className="calculated-profit">
                                = {formatCurrency(parseFloat(editValues.sales) * parseFloat(editValues.profitPercent) / 100)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="value-group">
                            <div className="value-row">
                              <span className="label">Omsetning:</span>
                              <span className="amount">{budget.sales ? formatCurrency(budget.sales) : '-'}</span>
                            </div>
                            <div className="value-row">
                              <span className="label">Fortjeneste:</span>
                              <span className="amount profit">
                                {budget.sales
                                  ? `${budget.profitPercent}% = ${formatCurrency(budget.profit)}`
                                  : '-'}
                              </span>
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
                            onClick={() => handleEdit(monthKey, budget.sales, budget.profitPercent)}
                          >
                            {budget.sales || budget.profitPercent ? <Edit2 size={14} /> : <Plus size={14} />}
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

      {/* Mobile: Card view */}
      <div className="budget-mobile">
        <h3 className="budget-mobile-title">Månedlig oversikt</h3>
        {yearComparison.map(({ month, monthKey, currentYear: current, previousYear: previous, budget }) => {
          const isEditing = editingMonth === monthKey
          const salesPercentage = calculatePercentage(current.amount, budget.sales)
          const profitPercentage = calculatePercentage(current.profit, budget.profit)

          return (
            <Card key={monthKey} className="budget-month-card">
              <CardContent>
                <div className="month-card-header">
                  <h4>{month}</h4>
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
                      onClick={() => handleEdit(monthKey, budget.sales, budget.profitPercent)}
                    >
                      {budget.sales || budget.profitPercent ? <Edit2 size={14} /> : <Plus size={14} />}
                    </Button>
                  )}
                </div>

                <div className="month-card-sections">
                  {/* Faktisk */}
                  <div className="month-card-section">
                    <span className="month-card-section-title actual-tag">{currentYear}</span>
                    <div className="month-card-row">
                      <span className="month-card-label">Omsetning</span>
                      <span className="month-card-value">{formatCurrency(current.amount)}</span>
                      {salesPercentage && (
                        <span className={`percentage ${salesPercentage.isPositive ? 'good' : 'warning'}`}>
                          {salesPercentage.isPositive ? '+' : '-'}{salesPercentage.value}%
                        </span>
                      )}
                    </div>
                    <div className="month-card-row">
                      <span className="month-card-label">Fortjeneste</span>
                      <span className="month-card-value profit">{formatCurrency(current.profit)}</span>
                      {profitPercentage && (
                        <span className={`percentage ${profitPercentage.isPositive ? 'good' : 'warning'}`}>
                          {profitPercentage.isPositive ? '+' : '-'}{profitPercentage.value}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Budsjett */}
                  <div className="month-card-section">
                    <span className="month-card-section-title budget-tag">Budsjett</span>
                    {isEditing ? (
                      <div className="month-card-edit">
                        <Input
                          type="number"
                          placeholder="Omsetning"
                          value={editValues.sales}
                          onChange={(e) => setEditValues({ ...editValues, sales: e.target.value })}
                          className="budget-input-mobile"
                        />
                        <div className="percent-input-group">
                          <Input
                            type="number"
                            placeholder="Fortjeneste %"
                            value={editValues.profitPercent}
                            onChange={(e) => setEditValues({ ...editValues, profitPercent: e.target.value })}
                            className="budget-input-mobile"
                            min="0"
                            max="100"
                            step="0.1"
                          />
                          <span className="percent-symbol">%</span>
                        </div>
                        {editValues.sales && editValues.profitPercent && (
                          <span className="calculated-profit">
                            = {formatCurrency(parseFloat(editValues.sales) * parseFloat(editValues.profitPercent) / 100)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="month-card-row">
                          <span className="month-card-label">Omsetning</span>
                          <span className="month-card-value">{budget.sales ? formatCurrency(budget.sales) : '-'}</span>
                        </div>
                        <div className="month-card-row">
                          <span className="month-card-label">Fortjeneste</span>
                          <span className="month-card-value profit">
                            {budget.sales ? `${budget.profitPercent}% = ${formatCurrency(budget.profit)}` : '-'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Fjoråret */}
                  <div className="month-card-section">
                    <span className="month-card-section-title previous-tag">{currentYear - 1}</span>
                    <div className="month-card-row">
                      <span className="month-card-label">Omsetning</span>
                      <span className="month-card-value muted">{formatCurrency(previous.amount)}</span>
                    </div>
                    <div className="month-card-row">
                      <span className="month-card-label">Fortjeneste</span>
                      <span className="month-card-value muted profit">{formatCurrency(previous.profit)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
