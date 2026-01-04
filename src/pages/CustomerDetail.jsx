import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { 
  ArrowLeft, Edit, Trash2, Phone, Mail, Building, MapPin, Globe, Briefcase, Users, User,
  Plus, MessageSquare, Calendar, FileText, TrendingUp, Percent, ChevronDown, Clock, Check, Video,
  Search, Building2, ArrowRight
} from 'lucide-react'
import { supabase, isDemoMode } from '../lib/supabase'
import { useTenant } from '../contexts/TenantContext'
import { useActivities } from '../hooks/useActivities'
import { useSales } from '../hooks/useSales'
import { useCustomers } from '../hooks/useCustomers'
import { Button, Modal, Card, CardHeader, CardContent } from '../components/common'
import CustomerForm from '../components/customers/CustomerForm'
import { demoCustomers } from '../lib/demoData'
import { fetchCompanyData, searchByName, toCustomerData } from '../lib/brreg'

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { tenant } = useTenant()
  const { updateCustomer, deleteCustomer } = useCustomers()
  
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [infoExpanded, setInfoExpanded] = useState(false)
  
  // Inline notes state
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [editedNotes, setEditedNotes] = useState('')
  
  // Inline activity form state
  const [newActivity, setNewActivity] = useState({
    type: 'note',
    description: '',
    content: '',
    activity_date: new Date().toISOString().split('T')[0]
  })
  const [activityLoading, setActivityLoading] = useState(false)
  const dateInputRef = useRef(null)
  const lastPickerClose = useRef(0)

  // Convert private customer modal state
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [selectedPrivateSale, setSelectedPrivateSale] = useState(null)
  const [convertSearch, setConvertSearch] = useState('')
  const [convertLoading, setConvertLoading] = useState(false)
  const [brregResults, setBrregResults] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [brregError, setBrregError] = useState('')

  const { activities, createActivity, updateActivity, deleteActivity } = useActivities(id)
  const { sales, createSale, deleteSale, getTotalSales, getTotalProfit, getMarginPercent, refreshSales } = useSales(id)

  // Check if this is the "Privatkunder" collective customer
  const isPrivateCustomerCard = customer?.name === 'Privatkunder' && !customer?.org_nr

  // Filtrer aktiviteter: kommende (planlagte) vs historiske
  const scheduledActivities = useMemo(() => {
    return activities.filter(a => a.is_scheduled && !a.is_completed)
      .sort((a, b) => {
        const dateCompare = new Date(a.activity_date) - new Date(b.activity_date)
        if (dateCompare !== 0) return dateCompare
        return (a.activity_time || '').localeCompare(b.activity_time || '')
      })
  }, [activities])

  const completedActivities = useMemo(() => {
    return activities.filter(a => !a.is_scheduled || a.is_completed)
      .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
  }, [activities])

  useEffect(() => {
    fetchCustomer()
  }, [id, tenant])

  const fetchCustomer = async () => {
    if (!tenant) return

    setLoading(true)
    
    if (isDemoMode) {
      const found = demoCustomers.find(c => c.id === id && c.tenant_id === tenant.id)
      if (!found) {
        navigate('/customers')
      } else {
        setCustomer(found)
      }
      setLoading(false)
      return
    }
    
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .single()

    if (error || !data) {
      navigate('/customers')
    } else {
      setCustomer(data)
    }
    setLoading(false)
  }

  const handleUpdate = async (data) => {
    if (isDemoMode) {
      setCustomer({ ...customer, ...data })
      setShowEdit(false)
      return { error: null }
    }
    
    const { data: updated, error } = await supabase
      .from('customers')
      .update(data)
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .select()
      .single()

    if (!error) {
      setCustomer(updated)
      setShowEdit(false)
    }
    return { error }
  }

  const handleDelete = async () => {
    if (confirm('Er du sikker på at du vil slette denne kunden og all tilhørende data?')) {
      if (isDemoMode) {
        navigate('/customers')
        return
      }
      
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id)

      if (!error) {
        navigate('/customers')
      }
    }
  }

  const handleSaveNotes = async () => {
    if (editedNotes === customer.notes) {
      setIsEditingNotes(false)
      return
    }

    const { error } = await handleUpdate({ notes: editedNotes })
    if (!error) {
      setIsEditingNotes(false)
    } else {
      alert('Kunne ikke lagre notater: ' + error.message)
    }
  }

  const handleCreateActivity = async (e) => {
    e.preventDefault()
    if (!newActivity.description.trim()) return
    
    setActivityLoading(true)
    const { error } = await createActivity({ 
      ...newActivity, 
      customer_id: id,
      is_scheduled: false,
      is_completed: true
    })
    if (!error) {
      setNewActivity({
        type: 'note',
        description: '',
        content: '',
        activity_date: new Date().toISOString().split('T')[0]
      })
    }
    setActivityLoading(false)
  }

  const handleCompleteScheduled = async (activity) => {
    await updateActivity(activity.id, {
      is_completed: true,
      is_scheduled: false
    })
  }

  // Handle clicking on a private customer sale row
  const handlePrivateSaleClick = (sale) => {
    // Extract customer name from description "Privatkunde - Kundenavn"
    const match = sale.description.match(/^Privatkunde - (.+)$/)
    const customerName = match ? match[1] : sale.description
    
    setSelectedPrivateSale({ ...sale, extractedName: customerName })
    setConvertSearch(customerName) // Pre-fill with customer name
    setBrregResults([])
    setSelectedCompany(null)
    setBrregError('')
    setShowConvertModal(true)
  }

  // Look up company in Brreg (by name or org.nr)
  const handleBrregLookup = async () => {
    if (!convertSearch || convertSearch.length < 2) {
      setBrregError('Skriv minst 2 tegn')
      return
    }

    setConvertLoading(true)
    setBrregError('')
    setBrregResults([])
    setSelectedCompany(null)

    try {
      const cleanSearch = convertSearch.replace(/\s/g, '')
      
      // Check if it looks like an org number (9 digits)
      if (/^\d{9}$/.test(cleanSearch)) {
        const data = await fetchCompanyData(cleanSearch)
        if (data) {
          setBrregResults([data])
        } else {
          setBrregError('Fant ingen bedrift med dette org.nr')
        }
      } else {
        // Search by name
        const results = await searchByName(convertSearch, 10)
        if (results.length > 0) {
          setBrregResults(results.map(r => toCustomerData(r)))
        } else {
          setBrregError('Fant ingen bedrifter med dette navnet')
        }
      }
    } catch (err) {
      setBrregError('Kunne ikke søke i Brreg')
    }
    setConvertLoading(false)
  }

  // Convert private customer sales to business customer
  const handleConvertToBusinessCustomer = async () => {
    if (!selectedCompany || !selectedPrivateSale) return

    setConvertLoading(true)
    
    try {
      const orgNr = selectedCompany.org_nr.replace(/\s/g, '')
      
      // 1. Find or create the business customer
      let businessCustomerId = null
      
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, name')
        .eq('tenant_id', tenant.id)
        .eq('org_nr', orgNr)
        .single()

      if (existingCustomer) {
        businessCustomerId = existingCustomer.id
      } else {
        // Create new business customer with Brreg data
        const { data: newCustomer, error: createError } = await supabase
          .from('customers')
          .insert({
            tenant_id: tenant.id,
            name: selectedCompany.name,
            org_nr: orgNr,
            address: selectedCompany.address,
            industry: selectedCompany.industry,
            employee_count: selectedCompany.employee_count
          })
          .select('id')
          .single()

        if (createError) throw createError
        businessCustomerId = newCustomer.id
      }

      // 2. Find all sales with the same private customer name and move them
      const privateCustomerPattern = `Privatkunde - ${selectedPrivateSale.extractedName}`
      
      const { data: salesToMove, error: fetchError } = await supabase
        .from('sales')
        .select('id')
        .eq('customer_id', id) // Current "Privatkunder" customer
        .eq('description', privateCustomerPattern)

      if (fetchError) throw fetchError

      if (salesToMove && salesToMove.length > 0) {
        // Update all matching sales to point to the business customer
        const saleIds = salesToMove.map(s => s.id)
        
        const { error: updateError } = await supabase
          .from('sales')
          .update({ 
            customer_id: businessCustomerId,
            description: `Import (konvertert fra privatkunde)`
          })
          .in('id', saleIds)

        if (updateError) throw updateError
      }

      // 3. Refresh sales and close modal
      await refreshSales()
      setShowConvertModal(false)
      setSelectedPrivateSale(null)
      
      // Show success and offer to navigate to the new customer
      if (confirm(`${salesToMove?.length || 0} salg ble flyttet til ${selectedCompany.name}.\n\nVil du gå til kundekortet?`)) {
        navigate(`/customers/${businessCustomerId}`)
      }

    } catch (err) {
      setBrregError('Kunne ikke konvertere: ' + err.message)
    }
    
    setConvertLoading(false)
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK'
    }).format(amount)
  }

  const formatDateNorwegian = (dateString) => {
    if (!dateString) return ''
    const [year, month, day] = dateString.split('-')
    return `${day}.${month}.${year}`
  }

  const getActivityIcon = (type) => {
    switch (type) {
      case 'call': return Phone
      case 'email': return Mail
      case 'meeting': return Calendar
      case 'note': return FileText
      default: return MessageSquare
    }
  }

  if (loading) {
    return <div className="loading">Laster kunde...</div>
  }

  if (!customer) {
    return <div className="error">Kunde ikke funnet</div>
  }

  return (
    <div className="customer-detail">
      <div className="page-header">
        <div className="header-left">
          <Link to="/customers" className="back-link">
            <ArrowLeft size={20} />
            Tilbake
          </Link>
          <h1>{customer.name}</h1>
        </div>
        <div className="page-actions">
          <Button variant="secondary" onClick={() => setShowEdit(true)}>
            <Edit size={18} />
            Rediger
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            <Trash2 size={18} />
            Slett
          </Button>
        </div>
      </div>

      <div className="customer-grid">
        {/* Customer Info */}
        <Card className="customer-info-card">
          <CardHeader 
            className="collapsible-header"
            onClick={() => setInfoExpanded(!infoExpanded)}
          >
            <h3>Kundeinformasjon</h3>
            <div className="header-right">
              {!customer.org_nr && (
                <span className="customer-type-badge private">
                  <Users size={14} />
                  Privatkunde
                </span>
              )}
              <ChevronDown size={20} className={`collapse-icon ${infoExpanded ? 'expanded' : ''}`} />
            </div>
          </CardHeader>
          <CardContent className={`collapsible-content ${infoExpanded ? 'expanded' : ''}`}>
            <div className="info-grid">
              {customer.org_nr && (
                <div className="info-item">
                  <Building size={18} />
                  <div>
                    <label>Org.nr</label>
                    <span>{customer.org_nr}</span>
                  </div>
                </div>
              )}
              {customer.industry && (
                <div className="info-item">
                  <Briefcase size={18} />
                  <div>
                    <label>Bransje</label>
                    <span>{customer.industry}</span>
                  </div>
                </div>
              )}
              {customer.employee_count && (
                <div className="info-item">
                  <Users size={18} />
                  <div>
                    <label>Ansatte</label>
                    <span>{customer.employee_count}</span>
                  </div>
                </div>
              )}
              {customer.website && (
                <div className="info-item">
                  <Globe size={18} />
                  <div>
                    <label>Hjemmeside</label>
                    <a href={customer.website} target="_blank" rel="noopener noreferrer">{customer.website}</a>
                  </div>
                </div>
              )}
              {customer.email && (
                <div className="info-item">
                  <Mail size={18} />
                  <div>
                    <label>E-post</label>
                    <a href={`mailto:${customer.email}`}>{customer.email}</a>
                  </div>
                </div>
              )}
              {customer.phone && (
                <div className="info-item">
                  <Phone size={18} />
                  <div>
                    <label>Telefon</label>
                    <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                  </div>
                </div>
              )}
              {customer.contact_person && (
                <div className="info-item">
                  <User size={18} />
                  <div>
                    <label>Kontaktperson</label>
                    <span>{customer.contact_person}</span>
                  </div>
                </div>
              )}
              {customer.contact_phone && (
                <div className="info-item">
                  <Phone size={18} />
                  <div>
                    <label>Telefon kontaktperson</label>
                    <a href={`tel:${customer.contact_phone}`}>{customer.contact_phone}</a>
                  </div>
                </div>
              )}
              {customer.contact_email && (
                <div className="info-item">
                  <Mail size={18} />
                  <div>
                    <label>E-post kontaktperson</label>
                    <a href={`mailto:${customer.contact_email}`}>{customer.contact_email}</a>
                  </div>
                </div>
              )}
              {(customer.address || customer.postal_code || customer.city) && (
                <div className="info-item full-width">
                  <MapPin size={18} />
                  <div>
                    <label>Adresse</label>
                    <span>
                      {customer.address && <>{customer.address}<br/></>}
                      {customer.postal_code} {customer.city}
                    </span>
                  </div>
                </div>
              )}
              <div className="info-item full-width">
                <div>
                  <label>Notater (dobbeltklikk for å redigere)</label>
                  {isEditingNotes ? (
                    <div className="inline-edit-notes">
                      <textarea
                        className="input"
                        value={editedNotes}
                        onChange={(e) => setEditedNotes(e.target.value)}
                        autoFocus
                        rows={4}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey) handleSaveNotes()
                          if (e.key === 'Escape') setIsEditingNotes(false)
                        }}
                      />
                      <div className="inline-edit-actions">
                        <small>Ctrl+Enter for å lagre • Esc for å avbryte</small>
                        <div className="btn-group">
                          <Button variant="secondary" size="sm" onClick={() => setIsEditingNotes(false)}>Avbryt</Button>
                          <Button size="sm" onClick={handleSaveNotes}>Lagre</Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p 
                      className={`notes-text ${!customer.notes ? 'empty' : ''}`}
                      onDoubleClick={() => {
                        setEditedNotes(customer.notes || '')
                        setIsEditingNotes(true)
                      }}
                      title="Dobbeltklikk for å redigere"
                    >
                      {customer.notes || 'Ingen notater. Dobbeltklikk for å legge til...'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Summary */}
        <Card>
          <CardHeader>
            <h3>Salgsoversikt</h3>
            {customer.brreg_updated_at && (
              <small className="last-updated">
                Oppdatert: {new Date(customer.brreg_updated_at).toLocaleDateString('nb-NO')}
              </small>
            )}
          </CardHeader>
          <CardContent>
            <div className="sales-stats-grid">
              <div className="sales-stat">
                <TrendingUp size={24} className="stat-icon sales" />
                <div>
                  <span className="stat-label">Totalt salg eks. mva</span>
                  <span className="stat-value">{formatCurrency(getTotalSales())}</span>
                </div>
              </div>
              <div className="sales-stat">
                <TrendingUp size={24} className="stat-icon profit" />
                <div>
                  <span className="stat-label">Total fortjeneste eks. mva</span>
                  <span className="stat-value">{formatCurrency(getTotalProfit())}</span>
                </div>
              </div>
              <div className="sales-stat">
                <Percent size={24} className="stat-icon margin" />
                <div>
                  <span className="stat-label">Dekningsgrad</span>
                  <span className="stat-value">{getMarginPercent() > 0 ? `${getMarginPercent().toFixed(1)}%` : '0%'}</span>
                </div>
              </div>
            </div>

            {/* Sales List */}
            {sales.length > 0 ? (
              <div className="sales-list">
                <h4 className="sales-list-title">
                  Salgshistorikk ({sales.length} transaksjoner)
                  {isPrivateCustomerCard && (
                    <span className="sales-list-hint">Klikk på en rad for å konvertere til bedriftskunde</span>
                  )}
                </h4>
                <div className="sales-list-wrapper">
                  <table className={`sales-table ${isPrivateCustomerCard ? 'clickable' : ''}`}>
                    <thead>
                      <tr>
                        <th>Dato</th>
                        <th>Beskrivelse</th>
                        <th className="text-right">Beløp</th>
                        <th className="text-right">Fortjeneste</th>
                        {isPrivateCustomerCard && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map(sale => (
                        <tr 
                          key={sale.id}
                          onClick={isPrivateCustomerCard ? () => handlePrivateSaleClick(sale) : undefined}
                          className={isPrivateCustomerCard ? 'clickable-row' : ''}
                        >
                          <td className="sale-date">
                            {new Date(sale.sale_date).toLocaleDateString('nb-NO')}
                          </td>
                          <td className="sale-description">{sale.description}</td>
                          <td className="sale-amount text-right">{formatCurrency(sale.amount)}</td>
                          <td className="sale-profit text-right">{formatCurrency(sale.profit || 0)}</td>
                          {isPrivateCustomerCard && (
                            <td className="sale-convert-hint">
                              <Building2 size={16} />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="empty-text">Ingen salgsdata importert ennå</p>
            )}
          </CardContent>
        </Card>

        {/* Activities */}
        <Card className="activities-card">
          <CardHeader>
            <h3>Aktivitetslogg</h3>
          </CardHeader>
          <CardContent>
            {/* Inline activity form */}
            <form onSubmit={handleCreateActivity} className="inline-activity-form">
              <div className="activity-form-row">
                <select
                  value={newActivity.type}
                  onChange={(e) => setNewActivity(prev => ({ ...prev, type: e.target.value }))}
                  className="input activity-type-select"
                >
                  <option value="note">Notat</option>
                  <option value="call">Samtale</option>
                  <option value="email">E-post</option>
                  <option value="meeting">Møte</option>
                </select>
              <div 
                className="date-input-wrapper"
                onClick={() => {
                  // Unngå å åpne igjen rett etter lukking
                  if (Date.now() - lastPickerClose.current > 300) {
                    dateInputRef.current?.showPicker()
                  }
                }}
              >
                <input
                  ref={dateInputRef}
                  type="date"
                  value={newActivity.activity_date}
                  onChange={(e) => setNewActivity(prev => ({ ...prev, activity_date: e.target.value }))}
                  onBlur={() => lastPickerClose.current = Date.now()}
                  className="input activity-date-input date-hidden"
                />
                <div className="date-display input">
                  <Calendar size={16} />
                  {formatDateNorwegian(newActivity.activity_date)}
                </div>
              </div>
              </div>
              <div className="input-with-indicator">
                <input
                  type="text"
                  value={newActivity.description}
                  onChange={(e) => setNewActivity(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Beskrivelse av aktiviteten..."
                  className="input"
                  required
                />
                {!newActivity.description.trim() && <span className="required-indicator">*</span>}
              </div>
              <textarea
                value={newActivity.content}
                onChange={(e) => setNewActivity(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Detaljer (valgfritt)..."
                className="input activity-content-input"
                rows={2}
              />
              <Button 
                type="submit" 
                size="sm" 
                loading={activityLoading}
                disabled={!newActivity.description.trim()}
              >
                <Plus size={16} />
                Legg til
              </Button>
            </form>

            {/* Upcoming scheduled activities */}
            {scheduledActivities.length > 0 && (
              <div className="scheduled-section">
                <h4 className="section-subheader">
                  <Clock size={16} />
                  Kommende
                </h4>
                <ul className="scheduled-list">
                  {scheduledActivities.map(activity => {
                    const Icon = getActivityIcon(activity.type)
                    return (
                      <li key={activity.id} className={`scheduled-item type-${activity.type}`}>
                        <div className="scheduled-icon">
                          <Icon size={16} />
                        </div>
                        <div className="scheduled-content">
                          <div className="scheduled-header">
                            <span className="scheduled-datetime">
                              {new Date(activity.activity_date).toLocaleDateString('nb-NO', { 
                                weekday: 'short', 
                                day: 'numeric', 
                                month: 'short' 
                              })}
                              {activity.activity_time && ` kl. ${activity.activity_time.substring(0, 5)}`}
                            </span>
                          </div>
                          <p>{activity.description}</p>
                        </div>
                        <div className="scheduled-actions">
                          <button 
                            className="action-btn complete"
                            onClick={() => handleCompleteScheduled(activity)}
                            title="Marker som utført"
                          >
                            <Check size={16} />
                          </button>
                          <button 
                            className="action-btn delete"
                            onClick={() => deleteActivity(activity.id)}
                            title="Slett"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Completed activity list */}
            <h4 className="section-subheader">
              <FileText size={16} />
              Historikk
            </h4>
            {completedActivities.length === 0 ? (
              <p className="empty-text">Ingen aktiviteter registrert</p>
            ) : (
              <ul className="activity-timeline">
                {completedActivities.map(activity => {
                  const Icon = getActivityIcon(activity.type)
                  return (
                    <li key={activity.id} className="timeline-item">
                      <div className={`timeline-icon type-${activity.type}`}>
                        <Icon size={16} />
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="activity-type">{activity.type}</span>
                          <span className="activity-date">
                            {new Date(activity.activity_date).toLocaleDateString('nb-NO')}
                          </span>
                        </div>
                        <p>{activity.description}</p>
                        {activity.content && (
                          <div className="activity-content">
                            {activity.content}
                          </div>
                        )}
                      </div>
                      <button 
                        className="btn-icon delete-btn"
                        onClick={() => deleteActivity(activity.id)}
                        title="Slett"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        title="Rediger kunde"
      >
        <CustomerForm 
          customer={customer}
          onSubmit={handleUpdate} 
          onCancel={() => setShowEdit(false)} 
        />
      </Modal>

      {/* Convert Private Customer Modal */}
      <Modal
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        title="Konverter til bedriftskunde"
      >
        {selectedPrivateSale && (
          <div className="convert-modal">
            <div className="convert-info">
              <p className="convert-customer-name">
                <User size={18} />
                {selectedPrivateSale.extractedName}
              </p>
              <p className="convert-sale-info">
                Salg: {formatCurrency(selectedPrivateSale.amount)} ({new Date(selectedPrivateSale.sale_date).toLocaleDateString('nb-NO')})
              </p>
            </div>

            <div className="convert-search">
              <label>Søk opp bedrift (navn eller org.nr)</label>
              <div className="convert-search-row">
                <input
                  type="text"
                  className="input"
                  placeholder="Bedriftsnavn eller 123 456 789"
                  value={convertSearch}
                  onChange={(e) => setConvertSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBrregLookup()}
                />
                <Button 
                  onClick={handleBrregLookup} 
                  disabled={convertLoading || !convertSearch}
                >
                  <Search size={18} />
                  Søk
                </Button>
              </div>
              {brregError && <p className="convert-error">{brregError}</p>}
            </div>

            {/* Search results list */}
            {brregResults.length > 0 && !selectedCompany && (
              <div className="convert-results-list">
                <p className="results-count">{brregResults.length} bedrifter funnet</p>
                <ul className="company-list">
                  {brregResults.map((company, index) => (
                    <li 
                      key={index} 
                      className="company-list-item"
                      onClick={() => setSelectedCompany(company)}
                    >
                      <Building2 size={18} />
                      <div className="company-list-info">
                        <span className="company-list-name">{company.name}</span>
                        <span className="company-list-details">
                          {company.org_nr}
                          {company.industry && ` • ${company.industry}`}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Selected company */}
            {selectedCompany && (
              <div className="convert-result">
                <div className="convert-company-card">
                  <Building2 size={24} />
                  <div>
                    <p className="company-name">{selectedCompany.name}</p>
                    <p className="company-org-nr">{selectedCompany.org_nr}</p>
                    <p className="company-details">
                      {selectedCompany.industry && <span>{selectedCompany.industry}</span>}
                      {selectedCompany.employee_count && <span>{selectedCompany.employee_count} ansatte</span>}
                    </p>
                    {selectedCompany.address && <p className="company-address">{selectedCompany.address}</p>}
                  </div>
                  <button 
                    className="btn-change-company"
                    onClick={() => setSelectedCompany(null)}
                  >
                    Endre
                  </button>
                </div>
                
                <div className="convert-action">
                  <p className="convert-description">
                    Alle salg fra "<strong>{selectedPrivateSale.extractedName}</strong>" vil bli flyttet til denne bedriften.
                  </p>
                  <Button onClick={handleConvertToBusinessCustomer} disabled={convertLoading}>
                    <ArrowRight size={18} />
                    {convertLoading ? 'Konverterer...' : 'Flytt salg til bedrift'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
