import { useState, useEffect, useRef } from 'react'
import { Search, Building2, MapPin, Loader2 } from 'lucide-react'
import { Button, Input } from '../common'
import { search, toCustomerData, formatOrgNr } from '../../lib/brreg'

export default function CustomerForm({ customer, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: customer?.name || '',
    org_nr: customer?.org_nr || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    address: customer?.address || '',
    postal_code: customer?.postal_code || '',
    city: customer?.city || '',
    industry: customer?.industry || '',
    employee_count: customer?.employee_count || '',
    website: customer?.website || '',
    notes: customer?.notes || ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Brønnøysund-søk state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  // Søk i Brønnøysundregisteret
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      const results = await search(searchQuery)
      setSearchResults(results)
      setShowResults(true)
      setIsSearching(false)
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [searchQuery])

  // Lukk resultater når man klikker utenfor
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectCompany = (enhet) => {
    const data = toCustomerData(enhet)
    setFormData(prev => ({
      ...prev,
      name: data.name,
      org_nr: data.org_nr,
      address: data.address,
      postal_code: data.postal_code,
      city: data.city,
      industry: data.industry,
      employee_count: data.employee_count,
      website: data.website
    }))
    setSearchQuery('')
    setShowResults(false)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await onSubmit(formData)
    
    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="customer-form">
      {error && <div className="alert alert-error">{error}</div>}
      
      {/* Brønnøysund-søk */}
      {!customer && (
        <div className="brreg-search" ref={searchRef}>
          <label>Søk i Brønnøysundregisteret</label>
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
              placeholder="Søk på bedriftsnavn eller org.nr..."
              className="input search-input"
            />
            {isSearching && <Loader2 size={18} className="search-spinner" />}
          </div>
          
          {showResults && searchResults.length > 0 && (
            <ul className="brreg-results">
              {searchResults.map((enhet) => (
                <li 
                  key={enhet.organisasjonsnummer}
                  onClick={() => handleSelectCompany(enhet)}
                  className="brreg-result-item"
                >
                  <div className="result-main">
                    <Building2 size={16} />
                    <div>
                      <strong>{enhet.navn}</strong>
                      <span className="org-nr">{formatOrgNr(enhet.organisasjonsnummer)}</span>
                    </div>
                  </div>
                  {(enhet.forretningsadresse || enhet.postadresse) && (
                    <div className="result-address">
                      <MapPin size={14} />
                      <span>
                        {(enhet.forretningsadresse || enhet.postadresse)?.poststed}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          
          {showResults && searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
            <div className="brreg-no-results">
              Ingen treff i Brønnøysundregisteret
            </div>
          )}
        </div>
      )}
      
      <Input
        label="Kundenavn *"
        name="name"
        value={formData.name}
        onChange={handleChange}
        required
        placeholder="Bedriftens navn"
      />

      <Input
        label="Organisasjonsnummer"
        name="org_nr"
        value={formData.org_nr}
        onChange={handleChange}
        placeholder="123 456 789"
      />

      <div className="form-row">
        <Input
          label="E-post"
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="kontakt@bedrift.no"
        />

        <Input
          label="Telefon"
          type="tel"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          placeholder="+47 123 45 678"
        />
      </div>

      <Input
        label="Gateadresse"
        name="address"
        value={formData.address}
        onChange={handleChange}
        placeholder="Gateadresse"
      />

      <div className="form-row form-row-address">
        <Input
          label="Postnummer"
          name="postal_code"
          value={formData.postal_code}
          onChange={handleChange}
          placeholder="0000"
        />

        <Input
          label="Poststed"
          name="city"
          value={formData.city}
          onChange={handleChange}
          placeholder="Sted"
        />
      </div>

      <Input
        label="Bransje"
        name="industry"
        value={formData.industry}
        onChange={handleChange}
        placeholder="F.eks. Programmeringstjenester"
        disabled={!!customer}
      />

      <div className="form-row">
        <Input
          label="Antall ansatte"
          name="employee_count"
          value={formData.employee_count}
          onChange={handleChange}
          placeholder="0"
          disabled={!!customer}
        />

        <Input
          label="Hjemmeside"
          name="website"
          type="url"
          value={formData.website}
          onChange={handleChange}
          placeholder="https://www.example.no"
        />
      </div>

      <div className="input-group">
        <label htmlFor="notes">Notater</label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          placeholder="Eventuelle notater om kunden..."
          className="input"
        />
      </div>

      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel} type="button">
          Avbryt
        </Button>
        <Button type="submit" loading={loading}>
          {customer ? 'Lagre endringer' : 'Opprett kunde'}
        </Button>
      </div>
    </form>
  )
}
