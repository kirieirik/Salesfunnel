import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Users, DollarSign, UserPlus, Mail, Send } from 'lucide-react'
import { useCustomers } from '../hooks/useCustomers'
import { useSales } from '../hooks/useSales'
import { useActivities } from '../hooks/useActivities'
import { useTenant } from '../contexts/TenantContext'
import { useAuth } from '../contexts/AuthContext'
import Card, { CardContent, CardHeader } from '../components/common/Card'

export default function Dashboard() {
  const { tenant } = useTenant()
  const { user } = useAuth()
  const { customers } = useCustomers()
  const { sales, getTotalSales, getSalesByMonth } = useSales()
  const { activities } = useActivities()

  const totalSales = getTotalSales()
  const salesByMonth = getSalesByMonth()
  const recentActivities = activities.slice(0, 5)

  // Beregn totalt salg for inneværende år
  const currentYear = new Date().getFullYear()
  const totalSalesThisYear = useMemo(() => {
    return sales
      .filter(sale => new Date(sale.sale_date).getFullYear() === currentYear)
      .reduce((sum, sale) => sum + (sale.amount || 0), 0)
  }, [sales, currentYear])

  // Beregn antall nye kunder i inneværende år
  const newCustomersThisYear = useMemo(() => {
    return customers.filter(customer => 
      new Date(customer.created_at).getFullYear() === currentYear
    ).length
  }, [customers, currentYear])

  // Sammenligning år-til-år for alle 12 måneder med både omsetning og fortjeneste
  const yearComparison = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des']
    const previousYear = currentYear - 1
    
    // Grupper salg per måned med både amount og profit
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
      
      return {
        month: name,
        currentYear: {
          amount: currentYearData.amount,
          profit: currentYearData.profit
        },
        previousYear: {
          amount: previousYearData.amount,
          profit: previousYearData.profit
        }
      }
    })
  }, [sales, currentYear])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK'
    }).format(amount)
  }

  if (!tenant) {
    return (
      <div className="dashboard">
        <div className="empty-state">
          <h2>Velkommen til Salesfunnel!</h2>
          <p>Du må opprette eller bli med i en organisasjon for å komme i gang.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Oversikt for {tenant.name}</p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <Card className="stat-card">
          <CardContent>
            <div className="stat-icon">
              <Users size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{customers.length}</span>
              <span className="stat-label">Kunder</span>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent>
            <div className="stat-icon">
              <DollarSign size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{formatCurrency(totalSalesThisYear)}</span>
              <span className="stat-label">Salg i {currentYear}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent>
            <div className="stat-icon">
              <UserPlus size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{newCustomersThisYear}</span>
              <span className="stat-label">Nye kunder i {currentYear}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="dashboard-grid">
        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <h3>Siste aktiviteter</h3>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="empty-text">Ingen aktiviteter ennå</p>
            ) : (
              <ul className="activity-list">
                {recentActivities.map(activity => {
                  const isSentEmail = activity.type === 'email' && activity.description?.includes('sendt')
                  const isReceivedEmail = activity.type === 'email' && activity.description?.includes('mottatt')
                  
                  return (
                    <li key={activity.id} className="activity-item">
                      <span className={`activity-type ${isSentEmail ? 'type-email-sent' : isReceivedEmail ? 'type-email-received' : `type-${activity.type}`}`}>
                        {activity.type === 'email' && (isSentEmail ? <Send size={12} /> : <Mail size={12} />)}
                        {activity.type}
                      </span>
                      <div className="activity-details">
                        {activity.customer?.id ? (
                          <Link to={`/customers/${activity.customer.id}`} className="customer-link">
                            {activity.customer?.name}
                          </Link>
                        ) : (
                          <strong>{activity.customer?.name}</strong>
                        )}
                        <p>{activity.description}</p>
                        <small>
                          {new Date(activity.activity_date).toLocaleDateString('nb-NO')}
                          {activity.content && <span className="activity-meta"> • {activity.content}</span>}
                        </small>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Year-over-Year Comparison */}
        <Card>
          <CardHeader>
            <h3>Sammenligning år-til-år</h3>
          </CardHeader>
          <CardContent>
            <div className="comparison-header">
              <span className="comparison-month-label"></span>
              <div className="comparison-year-labels">
                <span className="year-label current">{currentYear}</span>
                <span className="year-label previous">{currentYear - 1}</span>
              </div>
            </div>
            <ul className="comparison-list">
              {yearComparison.map(({ month, currentYear: current, previousYear: previous }) => (
                <li key={month} className="comparison-item">
                  <span className="comparison-month">{month}</span>
                  <div className="comparison-values">
                    <div className="year-data current-year">
                      <div className="value-row">
                        <span className="value-label">Omsetning:</span>
                        <span className="value-amount">{formatCurrency(current.amount)}</span>
                      </div>
                      <div className="value-row">
                        <span className="value-label">Fortjeneste:</span>
                        <span className="value-amount profit">{formatCurrency(current.profit)}</span>
                      </div>
                    </div>
                    <div className="year-data previous-year">
                      <div className="value-row">
                        <span className="value-amount">{formatCurrency(previous.amount)}</span>
                      </div>
                      <div className="value-row">
                        <span className="value-amount profit">{formatCurrency(previous.profit)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
