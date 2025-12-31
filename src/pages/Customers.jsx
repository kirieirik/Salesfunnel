import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Upload, MoreVertical, Edit, Trash2, RefreshCw, User, Building2 } from 'lucide-react'
import { useCustomers } from '../hooks/useCustomers'
import { useTenant } from '../contexts/TenantContext'
import { Button, Input, Modal, Card } from '../components/common'
import CustomerForm from '../components/customers/CustomerForm'
import ImportCustomers from '../components/customers/ImportCustomers'

export default function Customers() {
  const { tenant } = useTenant()
  const { customers, loading, createCustomer, updateCustomer, deleteCustomer, importCustomers, syncAllCustomersFromBrreg } = useCustomers()
  
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [activeMenu, setActiveMenu] = useState(null)
  const [syncing, setSyncing] = useState(false)

  const filteredCustomers = customers.filter(customer => 
    customer.name.toLowerCase().includes(search.toLowerCase()) ||
    customer.org_nr?.includes(search) ||
    customer.email?.toLowerCase().includes(search.toLowerCase())
  )

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

      {/* Search */}
      <div className="search-bar">
        <Search size={20} />
        <input
          type="text"
          placeholder="Søk etter kunde, org.nr eller e-post..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="loading">Laster kunder...</div>
      ) : filteredCustomers.length === 0 ? (
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
              {filteredCustomers.map(customer => (
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
        </div>
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
