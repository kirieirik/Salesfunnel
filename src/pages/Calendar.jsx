import { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { 
  ChevronLeft, ChevronRight, Plus, Clock, User, Phone, Mail, 
  Calendar as CalendarIcon, Video, X, Check, Search, Building2, Loader2
} from 'lucide-react'
import { useTenant } from '../contexts/TenantContext'
import { useActivities } from '../hooks/useActivities'
import { useCustomers } from '../hooks/useCustomers'
import { Button, Card, CardHeader, CardContent, Modal } from '../components/common'
import { search, toCustomerData } from '../lib/brreg'

export default function Calendar() {
  const { tenant } = useTenant()
  const { activities, createActivity, updateActivity, deleteActivity } = useActivities()
  const { customers, createCustomer } = useCustomers()
  
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [newBooking, setNewBooking] = useState({
    customer_id: '',
    type: 'meeting',
    description: '',
    content: '',
    activity_date: '',
    activity_time: '09:00',
    is_scheduled: true
  })
  const [bookingLoading, setBookingLoading] = useState(false)

  // Søk-state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [brregResults, setBrregResults] = useState([])
  const [isSearchingBrreg, setIsSearchingBrreg] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  // Filtrer eksisterende kunder
  const filteredExistingCustomers = useMemo(() => {
    if (!customerSearchQuery || customerSearchQuery.length < 2 || selectedCustomer) return []
    return customers.filter(c => 
      c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
      (c.org_nr && c.org_nr.includes(customerSearchQuery))
    )
  }, [customers, customerSearchQuery, selectedCustomer])

  // Søk i eksisterende kunder og Brønnøysund
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!customerSearchQuery || customerSearchQuery.length < 2 || selectedCustomer?.name === customerSearchQuery) {
      setBrregResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearchingBrreg(true)
      const results = await search(customerSearchQuery)
      // Filtrer ut de som allerede finnes i kundelisten (basert på org_nr)
      const filteredResults = results.filter(res => 
        !customers.some(c => c.org_nr === res.organisasjonsnummer)
      )
      setBrregResults(filteredResults)
      setIsSearchingBrreg(false)
      setShowSearchResults(true)
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [customerSearchQuery, customers, selectedCustomer])

  // Lukk søkeresultater ved klikk utenfor
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Hent kun planlagte aktiviteter (fremtidige)
  const scheduledActivities = useMemo(() => {
    return activities.filter(a => a.is_scheduled && !a.is_completed)
  }, [activities])

  // Kalender-logikk
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  const monthNames = [
    'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'
  ]
  
  const dayNames = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']
  
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
  const getFirstDayOfMonth = (year, month) => {
    const day = new Date(year, month, 1).getDay()
    return day === 0 ? 6 : day - 1 // Konverter til mandag = 0
  }
  
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const daysInPrevMonth = getDaysInMonth(year, month - 1)
  
  // Bygg kalender-grid
  const calendarDays = useMemo(() => {
    const days = []
    
    // Forrige måned
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, daysInPrevMonth - i)
      })
    }
    
    // Denne måneden
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      })
    }
    
    // Neste måned
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      })
    }
    
    return days
  }, [year, month, daysInMonth, firstDay, daysInPrevMonth])

  const getActivitiesForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0]
    return scheduledActivities.filter(a => a.activity_date === dateStr)
  }

  const isToday = (date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const handleDayClick = (dayInfo) => {
    const dateStr = dayInfo.date.toISOString().split('T')[0]
    setSelectedDate(dayInfo.date)
    resetBookingForm()
    setNewBooking(prev => ({ ...prev, activity_date: dateStr }))
    setShowBookingModal(true)
  }

  const handleCreateBooking = async (e) => {
    e.preventDefault()
    if (!selectedCustomer || !newBooking.description.trim()) return
    
    setBookingLoading(true)
    
    let customerId = selectedCustomer.id

    // Hvis kunden ikke har ID, betyr det at den er fra BRREG og må opprettes
    if (!customerId) {
      const customerData = toCustomerData(selectedCustomer)
      const { data, error: customerError } = await createCustomer(customerData)
      
      if (customerError) {
        alert('Kunne ikke opprette kunde: ' + customerError.message)
        setBookingLoading(false)
        return
      }
      customerId = data.id
    }

    const { error } = await createActivity({
      ...newBooking,
      customer_id: customerId,
      is_scheduled: true,
      is_completed: false
    })
    
    if (!error) {
      setShowBookingModal(false)
      resetBookingForm()
    }
    setBookingLoading(false)
  }

  const resetBookingForm = () => {
    setNewBooking({
      customer_id: '',
      type: 'meeting',
      description: '',
      content: '',
      activity_date: '',
      activity_time: '09:00',
      is_scheduled: true
    })
    setCustomerSearchQuery('')
    setSelectedCustomer(null)
    setBrregResults([])
  }

  const handleCompleteActivity = async (activity) => {
    await updateActivity(activity.id, {
      is_completed: true,
      is_scheduled: false
    })
  }

  const handleDeleteActivity = async (activity) => {
    if (confirm('Er du sikker på at du vil slette denne bookingen?')) {
      await deleteActivity(activity.id)
    }
  }

  const getTypeIcon = (type) => {
    switch (type) {
      case 'call': return Phone
      case 'email': return Mail
      case 'meeting': return Video
      default: return CalendarIcon
    }
  }

  const getTypeLabel = (type) => {
    switch (type) {
      case 'call': return 'Samtale'
      case 'email': return 'E-post'
      case 'meeting': return 'Møte'
      default: return 'Aktivitet'
    }
  }

  const formatTime = (time) => {
    if (!time) return ''
    return time.substring(0, 5)
  }

  // Kommende aktiviteter (neste 7 dager)
  const upcomingActivities = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    
    return scheduledActivities
      .filter(a => {
        const actDate = new Date(a.activity_date)
        return actDate >= today && actDate <= nextWeek
      })
      .sort((a, b) => {
        const dateCompare = new Date(a.activity_date) - new Date(b.activity_date)
        if (dateCompare !== 0) return dateCompare
        return (a.activity_time || '').localeCompare(b.activity_time || '')
      })
  }, [scheduledActivities])

  return (
    <div className="calendar-page">
      <div className="page-header">
        <h1>Kalender</h1>
        <Button onClick={() => {
          setSelectedDate(new Date())
          resetBookingForm()
          setNewBooking(prev => ({ 
            ...prev, 
            activity_date: new Date().toISOString().split('T')[0] 
          }))
          setShowBookingModal(true)
        }}>
          <Plus size={18} />
          Ny booking
        </Button>
      </div>

      <div className="calendar-layout">
        {/* Kalender */}
        <Card className="calendar-card">
          <CardHeader>
            <button className="calendar-nav-btn" onClick={handlePrevMonth}>
              <ChevronLeft size={20} />
            </button>
            <h3>{monthNames[month]} {year}</h3>
            <button className="calendar-nav-btn" onClick={handleNextMonth}>
              <ChevronRight size={20} />
            </button>
          </CardHeader>
          <CardContent>
            <div className="calendar-grid">
              {dayNames.map(day => (
                <div key={day} className="calendar-day-name">{day}</div>
              ))}
              {calendarDays.map((dayInfo, index) => {
                const dayActivities = getActivitiesForDate(dayInfo.date)
                return (
                  <div
                    key={index}
                    className={`calendar-day ${!dayInfo.isCurrentMonth ? 'other-month' : ''} ${isToday(dayInfo.date) ? 'today' : ''}`}
                    onClick={() => handleDayClick(dayInfo)}
                  >
                    <span className="day-number">{dayInfo.day}</span>
                    {dayActivities.length > 0 && (
                      <div className="day-activities">
                        {dayActivities.slice(0, 3).map(act => {
                          const Icon = getTypeIcon(act.type)
                          return (
                            <div key={act.id} className={`day-activity type-${act.type}`}>
                              <Icon size={10} />
                              <span>{formatTime(act.activity_time)}</span>
                            </div>
                          )
                        })}
                        {dayActivities.length > 3 && (
                          <span className="more-activities">+{dayActivities.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Kommende aktiviteter */}
        <Card className="upcoming-card">
          <CardHeader>
            <h3>Kommende (7 dager)</h3>
          </CardHeader>
          <CardContent>
            {upcomingActivities.length === 0 ? (
              <p className="empty-text">Ingen planlagte aktiviteter</p>
            ) : (
              <ul className="upcoming-list">
                {upcomingActivities.map(activity => {
                  const Icon = getTypeIcon(activity.type)
                  const customer = customers.find(c => c.id === activity.customer_id)
                  return (
                    <li key={activity.id} className="upcoming-item">
                      <div className={`upcoming-icon type-${activity.type}`}>
                        <Icon size={16} />
                      </div>
                      <div className="upcoming-content">
                        <div className="upcoming-header">
                          <span className="upcoming-type">{getTypeLabel(activity.type)}</span>
                          <span className="upcoming-datetime">
                            {new Date(activity.activity_date).toLocaleDateString('nb-NO', { 
                              weekday: 'short', 
                              day: 'numeric', 
                              month: 'short' 
                            })}
                            {activity.activity_time && ` kl. ${formatTime(activity.activity_time)}`}
                          </span>
                        </div>
                        <p className="upcoming-description">{activity.description}</p>
                        {customer && (
                          <Link to={`/customers/${customer.id}`} className="upcoming-customer">
                            <User size={12} />
                            {customer.name}
                          </Link>
                        )}
                      </div>
                      <div className="upcoming-actions">
                        <button 
                          className="action-btn complete"
                          onClick={() => handleCompleteActivity(activity)}
                          title="Marker som utført"
                        >
                          <Check size={16} />
                        </button>
                        <button 
                          className="action-btn delete"
                          onClick={() => handleDeleteActivity(activity)}
                          title="Slett"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={showBookingModal}
        onClose={() => setShowBookingModal(false)}
        title="Ny booking"
      >
        <form onSubmit={handleCreateBooking} className="booking-form">
          <div className="input-group">
            <label>Kunde *</label>
            {selectedCustomer ? (
              <div className="selected-customer-display">
                <div className="selected-customer-info">
                  <Building2 size={18} />
                  <span>{selectedCustomer.name || selectedCustomer.navn}</span>
                </div>
                <button 
                  type="button" 
                  className="remove-customer-btn"
                  onClick={() => {
                    setSelectedCustomer(null)
                    setCustomerSearchQuery('')
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="customer-search-container" ref={searchRef}>
                <div className="search-input-wrapper">
                  <Search size={18} className="search-icon" />
                  <input
                    type="text"
                    className="input"
                    placeholder="Søk etter eksisterende kunde eller i Brønnøysund..."
                    value={customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value)
                      setShowSearchResults(true)
                    }}
                    onFocus={() => setShowSearchResults(true)}
                  />
                  {isSearchingBrreg && <Loader2 size={18} className="search-loader" />}
                </div>

                {showSearchResults && (customerSearchQuery.length >= 2) && (
                  <div className="search-results-dropdown">
                    {/* Eksisterende kunder */}
                    {filteredExistingCustomers.length > 0 && (
                      <div className="search-results-group">
                        {filteredExistingCustomers.map(customer => (
                          <div 
                            key={customer.id} 
                            className="search-result-item"
                            onClick={() => {
                              setSelectedCustomer(customer)
                              setShowSearchResults(false)
                            }}
                          >
                            <div className="search-result-name">
                              <User size={14} />
                              {customer.name}
                              <span className="search-result-badge">Eksisterende</span>
                            </div>
                            <div className="search-result-info">
                              {customer.org_nr && `Org.nr: ${customer.org_nr}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Brønnøysund-resultater */}
                    {brregResults.length > 0 && (
                      <div className="search-results-group">
                        {brregResults.map(enhet => (
                          <div 
                            key={enhet.organisasjonsnummer} 
                            className="search-result-item"
                            onClick={() => {
                              setSelectedCustomer(enhet)
                              setShowSearchResults(false)
                            }}
                          >
                            <div className="search-result-name">
                              <Building2 size={14} />
                              {enhet.navn}
                              <span className="search-result-badge brreg">Brønnøysund</span>
                            </div>
                            <div className="search-result-info">
                              Org.nr: {enhet.organisasjonsnummer} • {enhet.forretningsadresse?.poststed || 'Ukjent sted'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {filteredExistingCustomers.length === 0 && brregResults.length === 0 && !isSearchingBrreg && (
                      <div className="search-result-item empty">
                        Ingen treff funnet
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="input-group">
            <label>Type</label>
            <select
              value={newBooking.type}
              onChange={(e) => setNewBooking(prev => ({ ...prev, type: e.target.value }))}
              className="input"
            >
              <option value="meeting">Møte</option>
              <option value="call">Samtale</option>
              <option value="email">E-post</option>
            </select>
          </div>

          <div className="form-row">
            <div className="input-group">
              <label>Dato *</label>
              <input
                type="date"
                value={newBooking.activity_date}
                onChange={(e) => setNewBooking(prev => ({ ...prev, activity_date: e.target.value }))}
                className="input"
                required
              />
            </div>
            <div className="input-group">
              <label>Klokkeslett</label>
              <input
                type="time"
                value={newBooking.activity_time}
                onChange={(e) => setNewBooking(prev => ({ ...prev, activity_time: e.target.value }))}
                className="input"
              />
            </div>
          </div>

          <div className="input-group">
            <label>Beskrivelse *</label>
            <input
              type="text"
              value={newBooking.description}
              onChange={(e) => setNewBooking(prev => ({ ...prev, description: e.target.value }))}
              placeholder="F.eks. Oppfølgingsmøte, Demo, etc."
              className="input"
              required
            />
          </div>

          <div className="input-group">
            <label>Notater</label>
            <textarea
              value={newBooking.content}
              onChange={(e) => setNewBooking(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Ekstra detaljer..."
              className="input"
              rows={3}
            />
          </div>

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setShowBookingModal(false)}>
              Avbryt
            </Button>
            <Button 
              type="submit" 
              loading={bookingLoading}
              disabled={!selectedCustomer || !newBooking.description.trim()}
            >
              Opprett booking
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
