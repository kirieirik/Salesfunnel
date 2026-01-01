import { Users, DollarSign, Activity } from 'lucide-react'
import { useCustomers } from '../hooks/useCustomers'
import { useSales } from '../hooks/useSales'
import { useActivities } from '../hooks/useActivities'
import { useTenant } from '../contexts/TenantContext'
import Card, { CardContent, CardHeader } from '../components/common/Card'

export default function Dashboard() {
  const { tenant } = useTenant()
  const { customers } = useCustomers()
  const { sales, getTotalSales, getSalesByMonth } = useSales()
  const { activities } = useActivities()

  const totalSales = getTotalSales()
  const salesByMonth = getSalesByMonth()
  const recentActivities = activities.slice(0, 5)

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
              <span className="stat-value">{formatCurrency(totalSales)}</span>
              <span className="stat-label">Totalt salg</span>
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
                {recentActivities.map(activity => (
                  <li key={activity.id} className="activity-item">
                    <span className={`activity-type type-${activity.type}`}>
                      {activity.type}
                    </span>
                    <div className="activity-details">
                      <strong>{activity.customer?.name}</strong>
                      <p>{activity.description}</p>
                      <small>{new Date(activity.activity_date).toLocaleDateString('nb-NO')}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Sales by Month */}
        <Card>
          <CardHeader>
            <h3>Salg per måned</h3>
            <span className="year-label">{new Date().getFullYear()}</span>
          </CardHeader>
          <CardContent>
            {salesByMonth.length === 0 ? (
              <p className="empty-text">Ingen salgsdata ennå</p>
            ) : (
              <ul className="sales-list">
                {salesByMonth.slice(-6).reverse().map(({ month, total }) => {
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
