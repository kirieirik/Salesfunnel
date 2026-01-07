import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Users, DollarSign, Activity, ChevronLeft, ChevronRight, Mail, Send } from 'lucide-react'
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

  // År-velger state
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

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

  // Filtrer salg for valgt år
  const salesByMonthForYear = useMemo(() => {
    return salesByMonth.filter(({ month }) => month.startsWith(String(selectedYear)))
  }, [salesByMonth, selectedYear])

  // Finn tilgjengelige år fra salgsdata
  const availableYears = useMemo(() => {
    const years = new Set(salesByMonth.map(({ month }) => parseInt(month.split('-')[0])))
    years.add(new Date().getFullYear()) // Alltid vis inneværende år
    return Array.from(years).sort((a, b) => b - a)
  }, [salesByMonth])

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
              <Activity size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{activities.length}</span>
              <span className="stat-label">Aktiviteter</span>
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

        {/* Sales by Month */}
        <Card>
          <CardHeader>
            <h3>Salg per måned</h3>
            <div className="year-selector">
              <button 
                className="year-nav-btn"
                onClick={() => setSelectedYear(prev => prev - 1)}
                disabled={!availableYears.includes(selectedYear - 1) && selectedYear <= Math.min(...availableYears)}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="year-label">{selectedYear}</span>
              <button 
                className="year-nav-btn"
                onClick={() => setSelectedYear(prev => prev + 1)}
                disabled={selectedYear >= new Date().getFullYear()}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {salesByMonthForYear.length === 0 ? (
              <p className="empty-text">Ingen salgsdata for {selectedYear}</p>
            ) : (
              <ul className="sales-list">
                {salesByMonthForYear.slice(-6).reverse().map(({ month, total }) => {
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des']
                  const monthIndex = parseInt(month.split('-')[1]) - 1
                  const monthName = monthNames[monthIndex]
                  return (
                    <li key={month} className="sales-item">
                      <span>{monthName}</span>
                      <span className="sales-amount">{formatCurrency(total)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
