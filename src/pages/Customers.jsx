import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Upload, MoreVertical, Edit, Trash2, RefreshCw, User, Building2, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { useCustomers } from '../hooks/useCustomers'
import { useSales } from '../hooks/useSales'
import { useTenant } from '../contexts/TenantContext'
import { Button, Input, Modal, Card } from '../components/common'
import CustomerForm from '../components/customers/CustomerForm'
import ImportCustomers from '../components/customers/ImportCustomers'

export default function Customers() {
  const { tenant } = useTenant()
  const { customers, loading, createCustomer, updateCustomer, deleteCustomer, importCustomers, syncAllCustomersFromBrreg } = useCustomers()
  const { sales } = useSales() // Get all sales for sorting
  
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [activeMenu, setActiveMenu] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState('name') // name, employees, sales, profit
  const CUSTOMERS_PER_PAGE = 30

  // Calculate sales totals per customer
  const customerSalesData = useMemo(() => {
    const totals = {}
    sales.forEach(sale => {
      if (!totals[sale.customer_id]) {
        totals[sale.customer_id] = { totalSales: 0, totalProfit: 0 }
      }
      totals[sale.customer_id].totalSales += parseFloat(sale.amount) || 0
      totals[sale.customer_id].totalProfit += parseFloat(sale.profit) || 0
    })
    return totals
  }, [sales])

  const filteredCustomers = customers.filter(customer => 
    customer.name.toLowerCase().includes(search.toLowerCase()) ||
    customer.org_nr?.includes(search) ||
    customer.email?.toLowerCase().includes(search.toLowerCase())
  )

  // Sort customers
  const sortedCustomers = useMemo(() => {
    const sorted = [...filteredCustomers]
    
    switch (sortBy) {
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name, 'nb'))
      case 'employees':
        return sorted.sort((a, b) => (parseInt(b.employee_count) || 0) - (parseInt(a.employee_count) || 0))
      case 'sales':
        return sorted.sort((a, b) => {
          const salesA = customerSalesData[a.id]?.totalSales || 0
          const salesB = customerSalesData[b.id]?.totalSales || 0
          return salesB - salesA
        })
      case 'profit':
        return sorted.sort((a, b) => {
          const profitA = customerSalesData[a.id]?.totalProfit || 0
          const profitB = customerSalesData[b.id]?.totalProfit || 0
          return profitB - profitA
        })
      default:
        return sorted
    }
  }, [filteredCustomers, sortBy, customerSalesData])

  // Customer statistics
  const customerStats = useMemo(() => {
    const business = customers.filter(c => c.org_nr).length
    const private_ = customers.filter(c => !c.org_nr).length
    return { total: customers.length, business, private: private_ }
  }, [customers])

  // Pagination logic
  const totalPages = Math.ceil(sortedCustomers.length / CUSTOMERS_PER_PAGE)
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * CUSTOMERS_PER_PAGE
    return sortedCustomers.slice(startIndex, startIndex + CUSTOMERS_PER_PAGE)
  }, [sortedCustomers, currentPage])

  // Reset to page 1 when search or sort changes
  const handleSearchChange = (e) => {
    setSearch(e.target.value)
    setCurrentPage(1)
  }

  const handleSortChange = (e) => {
    setSortBy(e.target.value)
    setCurrentPage(1)
  }

  const handleCreate = async (data) => {
    const { error } = await createCustomer(data)
    if (!error) {
      setShowForm(false)
    }
    return { error }
  }

  const handleUpdate = async (data) => {
    const { error } = await updateCustomer(editingCustomer.id, data)
    if (!error) {
      setEditingCustomer(null)
    }
    return { error }
  }

  const handleDelete = async (id) => {
    if (confirm('Er du sikker på at du vil slette denne kunden?')) {
      await deleteCustomer(id)
      setActiveMenu(null)
    }
  }

  const handleImport = async (data) => {
    const { error } = await importCustomers(data)
    if (!error) {
      setShowImport(false)
    }
    return { error }
  }

  const handleSync = async () => {
    setSyncing(true)
    const result = await syncAllCustomersFromBrreg(true)
    setSyncing(false)
    alert(`Synkronisering fullført!\n\nOppdatert: ${result.synced}\nFeilet: ${result.failed}\nTotalt med org.nr: ${result.total}`)
  }

  if (!tenant) {
    return (
      <div className="customers-page">
        <div className="empty-state">
          <p>Velg eller opprett en organisasjon for å se kunder.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="customers-page">
      <div className="page-header">
        <h1>Kunder</h1>
        <div className="page-actions">
          <Button variant="secondary" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={18} className={syncing ? 'spin' : ''} />
            {syncing ? 'Synkroniserer...' : 'Synk fra Brreg'}
          </Button>
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Upload size={18} />
            Importer
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus size={18} />
            Ny kunde
          </Button>
        </div>
      </div>

      {/* Customer Statistics */}
      <div className="customer-stats-bar">
        <div className="stat-item total">
          <span className="stat-value">{customerStats.total}</span>
          <span className="stat-label">Totalt</span>
        </div>
        <div className="stat-item business">
          <Building2 size={16} />
          <span className="stat-value">{customerStats.business}</span>
          <span className="stat-label">Bedriftskunder</span>
        </div>
        <div className="stat-item private">
          <User size={16} />
          <span className="stat-value">{customerStats.private}</span>
          <span className="stat-label">Privatkunder</span>
        </div>
      </div>

      {/* Search and Sort */}
      <div className="search-sort-row">
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder="Søk etter kunde, org.nr eller e-post..."
            value={search}
            onChange={handleSearchChange}
          />
        </div>
        <div className="sort-dropdown">
          <ArrowUpDown size={16} />
          <select value={sortBy} onChange={handleSortChange}>
            <option value="name">A-Å (Navn)</option>
            <option value="employees">Antall ansatte</option>
            <option value="sales">Omsetning (høy-lav)</option>
            <option value="profit">Fortjeneste (høy-lav)</option>
          </select>
        </div>
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="loading">Laster kunder...</div>
      ) : sortedCustomers.length === 0 ? (
        <div className="empty-state">
          {search ? (
            <p>Ingen kunder matcher søket "{search}"</p>
          ) : (
            <>
              <p>Ingen kunder ennå</p>
              <Button onClick={() => setShowForm(true)}>
                <Plus size={18} />
                Legg til første kunde
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="customers-table-wrapper">
          <table className="customers-table">
            <thead>
              <tr>
                <th>Navn</th>
                <th>Type</th>
                <th>Bransje</th>
                <th>Ansatte</th>
                <th>E-post</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedCustomers.map(customer => (
                <tr key={customer.id}>
                  <td>
                    <Link to={`/customers/${customer.id}`} className="customer-name">
                      {customer.name}
                    </Link>
                    {customer.org_nr && (
                      <span className="customer-org-nr">{customer.org_nr}</span>
                    )}
                  </td>
                  <td>
                    {customer.org_nr ? (
                      <span className="customer-type-badge business">
                        <Building2 size={14} />
                        Bedrift
                      </span>
                    ) : (
                      <span className="customer-type-badge private">
                        <User size={14} />
                        Privat
                      </span>
                    )}
                  </td>
                  <td className="cell-industry">{customer.industry || '-'}</td>
                  <td>{customer.employee_count || '-'}</td>
                  <td>{customer.email || '-'}</td>
                  <td>
                    <div className="row-actions">
                      <button 
                        className="btn-icon"
                        onClick={() => setActiveMenu(activeMenu === customer.id ? null : customer.id)}
                      >
                        <MoreVertical size={18} />
                      </button>
                      {activeMenu === customer.id && (
                        <div className="dropdown-menu">
                          <button onClick={() => {
                            setEditingCustomer(customer)
                            setActiveMenu(null)
                          }}>
                            <Edit size={16} />
                            Rediger
                          </button>
                          <button 
                            className="danger"
                            onClick={() => handleDelete(customer.id)}
                          >
                            <Trash2 size={16} />
                            Slett
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={18} />
                Forrige
              </button>
              <div className="pagination-info">
                <span>Side {currentPage} av {totalPages}</span>
                <span className="pagination-count">
                  Viser {((currentPage - 1) * CUSTOMERS_PER_PAGE) + 1}-{Math.min(currentPage * CUSTOMERS_PER_PAGE, sortedCustomers.length)} av {sortedCustomers.length}
                </span>
              </div>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Neste
                <ChevronRight size={18} />
              </button>
            </div>
          )}        </div>
      )}

      {/* New Customer Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Ny kunde"
      >
        <CustomerForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </Modal>

      {/* Edit Customer Modal */}
      <Modal
        isOpen={!!editingCustomer}
        onClose={() => setEditingCustomer(null)}
        title="Rediger kunde"
      >
        <CustomerForm 
          customer={editingCustomer}
          onSubmit={handleUpdate} 
          onCancel={() => setEditingCustomer(null)} 
        />
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="Importer kunder"
        size="lg"
      >
        <ImportCustomers onImport={handleImport} onCancel={() => setShowImport(false)} />
      </Modal>
    </div>
  )
}
