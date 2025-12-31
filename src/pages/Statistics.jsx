import { useMemo } from 'react'
import { BarChart3, TrendingUp, Users, DollarSign } from 'lucide-react'
import { useCustomers } from '../hooks/useCustomers'
import { useSales } from '../hooks/useSales'
import { useTenant } from '../contexts/TenantContext'
import Card, { CardHeader, CardContent } from '../components/common/Card'

export default function Statistics() {
  const { tenant } = useTenant()
  const { customers } = useCustomers()
  const { sales, getSalesByMonth, getTotalSales } = useSales()

  const salesByMonth = getSalesByMonth()
  const totalSales = getTotalSales()

  const topCustomers = useMemo(() => {
    const customerSales = {}
    sales.forEach(sale => {
      const customerId = sale.customer_id
      const customerName = sale.customer?.name || 'Ukjent'
      if (!customerSales[customerId]) {
        customerSales[customerId] = { name: customerName, total: 0, count: 0 }
      }
      customerSales[customerId].total += parseFloat(sale.amount)
      customerSales[customerId].count += 1
    })
    
    return Object.values(customerSales)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [sales])

  const averageSale = sales.length > 0 ? totalSales / sales.length : 0

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
      maximumFractionDigits: 0
    }).format(amount)
  }

  const maxMonthlySales = Math.max(...salesByMonth.map(s => s.total), 1)

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
        <h1>Statistikk</h1>
        <p>Oversikt over salg og kunder for {tenant.name}</p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
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
              <TrendingUp size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{formatCurrency(averageSale)}</span>
              <span className="stat-label">Gjennomsnitt per salg</span>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent>
            <div className="stat-icon">
              <BarChart3 size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{sales.length}</span>
              <span className="stat-label">Antall salg</span>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent>
            <div className="stat-icon">
              <Users size={24} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{customers.length}</span>
              <span className="stat-label">Totalt kunder</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="statistics-grid">
        {/* Sales by Month Chart */}
        <Card>
          <CardHeader>
            <h3>Salg per måned</h3>
          </CardHeader>
          <CardContent>
            {salesByMonth.length === 0 ? (
              <p className="empty-text">Ingen salgsdata ennå</p>
            ) : (
              <div className="bar-chart">
                {salesByMonth.slice(-12).map(({ month, total }) => (
                  <div key={month} className="bar-item">
                    <div className="bar-container">
                      <div 
                        className="bar" 
                        style={{ height: `${(total / maxMonthlySales) * 100}%` }}
                        title={formatCurrency(total)}
                      />
                    </div>
                    <span className="bar-label">{month.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Customers */}
        <Card>
          <CardHeader>
            <h3>Topp kunder</h3>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="empty-text">Ingen salgsdata ennå</p>
            ) : (
              <ul className="top-customers-list">
                {topCustomers.map((customer, index) => (
                  <li key={index} className="top-customer-item">
                    <span className="rank">{index + 1}</span>
                    <div className="customer-info">
                      <span className="name">{customer.name}</span>
                      <span className="sales-count">{customer.count} salg</span>
                    </div>
                    <span className="total">{formatCurrency(customer.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
