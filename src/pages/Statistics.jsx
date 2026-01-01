import { useState, useMemo } from 'react'
import { TrendingUp, Users, DollarSign, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, Treemap } from 'recharts'
import { useCustomers } from '../hooks/useCustomers'
import { useSales } from '../hooks/useSales'
import { useTenant } from '../contexts/TenantContext'
import Card, { CardHeader, CardContent } from '../components/common/Card'
import './Statistics.css'

// Fargepalett
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']

// Treemap custom content
const TreemapContent = ({ x, y, width, height, name, value, index, formatCurrency }) => {
  const showText = width > 60 && height > 40
  const showValue = width > 80 && height > 55
  
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: COLORS[index % COLORS.length],
          stroke: '#fff',
          strokeWidth: 2,
          cursor: 'pointer'
        }}
      />
      {showText && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showValue ? 8 : 0)}
          textAnchor="middle"
          fill="#fff"
          fontSize={Math.min(12, width / 8)}
          fontWeight="600"
        >
          {name?.length > 15 ? name.substring(0, 15) + '...' : name}
        </text>
      )}
      {showValue && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 12}
          textAnchor="middle"
          fill="rgba(255,255,255,0.85)"
          fontSize={Math.min(10, width / 10)}
        >
          {formatCurrency(value)}
        </text>
      )}
    </g>
  )
}

export default function Statistics() {
  const { tenant } = useTenant()
  const { customers } = useCustomers()
  const { sales } = useSales()

  // Periode state
  const [viewMode, setViewMode] = useState('month') // 'month' eller 'year'
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())

  // Filtrer salg basert på valgt periode
  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      if (!sale.sale_date) return false
      if (viewMode === 'month') {
        return sale.sale_date.startsWith(selectedMonth)
      } else {
        return sale.sale_date.startsWith(String(selectedYear))
      }
    })
  }, [sales, viewMode, selectedMonth, selectedYear])

  // Beregn totaler for filtrert periode
  const periodStats = useMemo(() => {
    const totalSales = filteredSales.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
    const totalProfit = filteredSales.reduce((sum, s) => sum + (parseFloat(s.profit) || 0), 0)
    const marginPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0
    
    return { totalSales, totalProfit, marginPercent }
  }, [filteredSales])

  // Data for kakediagram
  const pieData = useMemo(() => {
    const customerData = {}
    
    filteredSales.forEach(sale => {
      const cid = sale.customer_id
      if (!customerData[cid]) {
        const customer = customers.find(c => c.id === cid)
        customerData[cid] = {
          id: cid,
          name: customer?.name || sale.customer?.name || 'Ukjent',
          value: 0,
          profit: 0
        }
      }
      customerData[cid].value += parseFloat(sale.amount) || 0
      customerData[cid].profit += parseFloat(sale.profit) || 0
    })

    return Object.values(customerData)
      .map(d => ({
        ...d,
        margin: d.value > 0 ? (d.profit / d.value) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredSales, customers])

  const topCustomers = useMemo(() => {
    return pieData.slice(0, 15)
  }, [pieData])

  // Treemap data - alle kunder
  const treemapData = useMemo(() => {
    return pieData.map((d, index) => ({
      name: d.name,
      size: d.value,
      value: d.value,
      profit: d.profit,
      margin: d.margin,
      index
    }))
  }, [pieData])

  // Navigering
  const navigatePeriod = (direction) => {
    if (viewMode === 'month') {
      const [year, month] = selectedMonth.split('-').map(Number)
      const date = new Date(year, month - 1 + direction, 1)
      setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
    } else {
      setSelectedYear(prev => prev + direction)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatPeriodLabel = () => {
    if (viewMode === 'month') {
      const [year, month] = selectedMonth.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1, 1)
      return date.toLocaleDateString('nb-NO', { year: 'numeric', month: 'long' })
    } else {
      return `Hele ${selectedYear}`
    }
  }

  const CustomBarTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="custom-tooltip">
          <p className="label"><strong>{data.name}</strong></p>
          <p className="info">Omsetning: {formatCurrency(data.value)}</p>
          <p className="info">Fortjeneste: {formatCurrency(data.profit)}</p>
          <p className="info">DG: {data.margin.toFixed(1)}%</p>
        </div>
      )
    }
    return null
  }

  const CustomTreemapTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="custom-tooltip">
          <p className="label"><strong>{data.name}</strong></p>
          <p className="info">Omsetning: {formatCurrency(data.value)}</p>
          <p className="info">Fortjeneste: {formatCurrency(data.profit)}</p>
          <p className="info">DG: {data.margin.toFixed(1)}%</p>
        </div>
      )
    }
    return null
  }

  if (!tenant) {
    return (
      <div className="statistics-page">
        <div className="empty-state">
          <p>Velg en organisasjon for å se statistikk.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="statistics-page">
      <div className="page-header">
        <div>
          <h1>Statistikk</h1>
          <p>Oversikt over salg og kunder for {tenant.name}</p>
        </div>
      </div>

      {/* Periode-velger */}
      <Card className="period-selector-card">
        <CardContent>
          <div className="period-selector-stats">
            <div className="view-mode-toggle">
              <button 
                className={`toggle-btn ${viewMode === 'month' ? 'active' : ''}`}
                onClick={() => setViewMode('month')}
              >
                <Calendar size={16} />
                Måned
              </button>
              <button 
                className={`toggle-btn ${viewMode === 'year' ? 'active' : ''}`}
                onClick={() => setViewMode('year')}
              >
                <Calendar size={16} />
                År
              </button>
            </div>

            <div className="period-navigator">
              <button className="nav-btn" onClick={() => navigatePeriod(-1)}>
                <ChevronLeft size={20} />
              </button>
              
              {viewMode === 'month' ? (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="period-input"
                />
              ) : (
                <select 
                  value={selectedYear} 
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="period-input"
                >
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              )}

              <button className="nav-btn" onClick={() => navigatePeriod(1)}>
                <ChevronRight size={20} />
              </button>
            </div>

            <span className="period-label">{formatPeriodLabel()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="stats-grid">
        <Card className="stat-card">
          <CardContent>
            <div className="stat-icon">
              <DollarSign size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{formatCurrency(periodStats.totalSales)}</span>
              <span className="stat-label">Totalt salg</span>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent>
            <div className="stat-icon profit">
              <TrendingUp size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{formatCurrency(periodStats.totalProfit)}</span>
              <span className="stat-label">Total fortjeneste</span>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent>
            <div className="stat-icon margin">
              <TrendingUp size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{periodStats.marginPercent.toFixed(1)}%</span>
              <span className="stat-label">Gjennomsnitt DG%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent>
            <div className="stat-icon">
              <Users size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{pieData.length}</span>
              <span className="stat-label">Kunder med salg</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="statistics-grid">
        {/* Horisontalt søylediagram - Topp kunder */}
        <Card>
          <CardHeader>
            <h3>Topp {Math.min(15, topCustomers.length)} kunder</h3>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="empty-text">Ingen salgsdata for denne perioden</p>
            ) : (
              <div className="bar-chart-container">
                <ResponsiveContainer width="100%" height={Math.max(300, topCustomers.length * 40)}>
                  <BarChart
                    data={topCustomers}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      width={120}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(name) => name.length > 18 ? name.substring(0, 18) + '...' : name}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {topCustomers.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Treemap - Alle kunder */}
        <Card>
          <CardHeader>
            <h3>Omsetningsfordeling ({pieData.length} kunder)</h3>
          </CardHeader>
          <CardContent>
            {treemapData.length === 0 ? (
              <p className="empty-text">Ingen salgsdata for denne perioden</p>
            ) : (
              <div className="treemap-container">
                <ResponsiveContainer width="100%" height={350}>
                  <Treemap
                    data={treemapData}
                    dataKey="size"
                    aspectRatio={4/3}
                    stroke="#fff"
                    content={<TreemapContent formatCurrency={formatCurrency} />}
                  >
                    <Tooltip content={<CustomTreemapTooltip />} />
                  </Treemap>
                </ResponsiveContainer>
                <p className="treemap-hint">Størrelsen på hver boks viser omsetning. Hold over for detaljer.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detaljert kundetabell */}
      <Card className="full-width-card">
        <CardHeader>
          <h3>Detaljert kundeoversikt</h3>
        </CardHeader>
        <CardContent>
          {topCustomers.length === 0 ? (
            <p className="empty-text">Ingen salgsdata for denne perioden</p>
          ) : (
            <div className="top-customers-container scrollable">
              <div className="top-customers-header">
                <span>#</span>
                <span>Kunde</span>
                <span className="text-right">Omsetning</span>
                <span className="text-right">Fortjeneste</span>
                <span className="text-right">DG%</span>
                <span className="text-right">Andel</span>
              </div>
              <ul className="top-customers-list">
                {pieData.map((customer, index) => (
                  <li key={customer.id} className="top-customer-item">
                    <span className="rank-number">{index + 1}</span>
                    <span className="name">{customer.name}</span>
                    <span className="total">{formatCurrency(customer.value)}</span>
                    <span className="profit">{formatCurrency(customer.profit)}</span>
                    <span className="margin">{customer.margin.toFixed(1)}%</span>
                    <span className="share">{((customer.value / periodStats.totalSales) * 100).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
