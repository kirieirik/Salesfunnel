import { useState, useRef, useEffect } from 'react'
import { Upload, FileSpreadsheet, ArrowRight, Check, AlertCircle, Loader2, X, RefreshCw, Save, FolderOpen, Trash2 } from 'lucide-react'
import { supabase, isDemoMode } from '../lib/supabase'
import { useTenant } from '../contexts/TenantContext'
import { Button, Card, CardHeader, CardContent, Input, Modal } from '../components/common'
import { searchByOrgNr } from '../lib/brreg'
import './Import.css'

// LocalStorage key for demo-modus templates
const DEMO_TEMPLATES_KEY = 'salesfunnel_import_templates'

// Feltene som kan mappes
const MAPPABLE_FIELDS = [
  { key: '', label: '-- Ikke importer --' },
  { key: 'customer_number', label: 'Kundenummer (internt)' },
  { key: 'name', label: 'Kundenavn *' },
  { key: 'org_nr', label: 'Org.nr (tom = privatkunde)' },
  { key: 'address', label: 'Adresse' },
  { key: 'postal_code', label: 'Postnummer' },
  { key: 'city', label: 'Poststed' },
  { key: 'phone', label: 'Telefon (bedrift)' },
  { key: 'email', label: 'E-post (bedrift)' },
  { key: 'contact_person', label: 'Kontaktperson' },
  { key: 'contact_phone', label: 'Telefon (kontakt)' },
  { key: 'contact_email', label: 'E-post (kontakt)' },
  { key: 'total_sales', label: 'Omsetning (salg)' },
  { key: 'total_cost', label: 'Varekost' },
  { key: 'total_profit', label: 'Fortjeneste' },
  { key: 'margin_percent', label: 'Margin %' },
  { key: 'order_count', label: 'Antall ordre' },
]

export default function Import() {
  const { tenant } = useTenant()
  const fileInputRef = useRef(null)
  
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [csvData, setCsvData] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [periodType, setPeriodType] = useState('month') // 'month' eller 'week'
  const [importMonth, setImportMonth] = useState('')
  const [importWeek, setImportWeek] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState('')
  const [hasHeaderRow, setHasHeaderRow] = useState(false) // Default: ingen header-rad
  const [rawCsvData, setRawCsvData] = useState([]) // Alle rader inkludert header

  // Template state
  const [templates, setTemplates] = useState([])
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Last inn templates ved oppstart
  useEffect(() => {
    loadTemplates()
  }, [tenant])

  const loadTemplates = async () => {
    if (isDemoMode) {
      const stored = localStorage.getItem(DEMO_TEMPLATES_KEY)
      if (stored) {
        setTemplates(JSON.parse(stored))
      }
      return
    }

    if (!tenant) return

    const { data, error } = await supabase
      .from('import_templates')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name')

    if (!error && data) {
      setTemplates(data)
    }
  }

  const saveTemplate = async () => {
    if (!templateName.trim()) return

    setSavingTemplate(true)

    const templateData = {
      name: templateName.trim(),
      mapping: mapping,
      column_count: headers.length
    }

    if (isDemoMode) {
      const newTemplate = {
        id: `template-${Date.now()}`,
        ...templateData,
        created_at: new Date().toISOString()
      }
      const updated = [...templates, newTemplate]
      setTemplates(updated)
      localStorage.setItem(DEMO_TEMPLATES_KEY, JSON.stringify(updated))
    } else {
      const { data, error } = await supabase
        .from('import_templates')
        .insert({
          tenant_id: tenant.id,
          ...templateData
        })
        .select()
        .single()

      if (!error && data) {
        setTemplates([...templates, data])
      }
    }

    setTemplateName('')
    setShowSaveTemplate(false)
    setSavingTemplate(false)
  }

  const applyTemplate = (template) => {
    // Bruk lagret mapping, men bare for kolonner som finnes
    const newMapping = {}
    Object.entries(template.mapping).forEach(([idx, field]) => {
      if (parseInt(idx) < headers.length) {
        newMapping[idx] = field
      }
    })
    // Fyll inn tomme for resterende kolonner
    headers.forEach((_, idx) => {
      if (!(idx in newMapping)) {
        newMapping[idx] = ''
      }
    })
    setMapping(newMapping)
  }

  const deleteTemplate = async (templateId) => {
    if (!confirm('Er du sikker på at du vil slette denne malen?')) return

    if (isDemoMode) {
      const updated = templates.filter(t => t.id !== templateId)
      setTemplates(updated)
      localStorage.setItem(DEMO_TEMPLATES_KEY, JSON.stringify(updated))
    } else {
      const { error } = await supabase
        .from('import_templates')
        .delete()
        .eq('id', templateId)

      if (!error) {
        setTemplates(templates.filter(t => t.id !== templateId))
      }
    }
  }

  // Parse CSV fil
  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim())
    const result = []
    
    for (const line of lines) {
      // Håndter både ; og , som separator
      const separator = line.includes(';') ? ';' : ','
      const values = []
      let current = ''
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === separator && !inQuotes) {
          values.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      values.push(current.trim())
      result.push(values)
    }
    
    return result
  }

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return
    
    setError('')
    setFile(selectedFile)
    
    // Prøv å lese med forskjellige encodings for å støtte norske tegn
    const tryReadWithEncoding = (encoding) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => resolve(event.target.result)
        reader.onerror = reject
        reader.readAsText(selectedFile, encoding)
      })
    }

    const processFile = async () => {
      try {
        // Først prøv UTF-8
        let text = await tryReadWithEncoding('UTF-8')
        
        // Hvis det inneholder replacement characters, prøv ISO-8859-1 (Latin-1)
        if (text.includes('�') || text.includes('?')) {
          const latin1Text = await tryReadWithEncoding('ISO-8859-1')
          // Sjekk om Latin-1 gir bedre resultat (inneholder Æ, Ø, Å)
          if (/[ÆØÅæøå]/.test(latin1Text)) {
            text = latin1Text
          }
        }
        
        const data = parseCSV(text)
        
        if (data.length < 2) {
          setError('CSV-filen må inneholde minst 2 rader')
          return
        }
        
        // Lagre all rådata
        setRawCsvData(data)
        
        // Default: Ingen header-rad, alle rader er data
        const columnCount = data[0]?.length || 0
        setHeaders(Array.from({ length: columnCount }, (_, i) => `Kolonne ${i + 1}`))
        setCsvData(data) // Alle rader er data
        setHasHeaderRow(false)
        
        // Initialiser tom mapping
        const initialMapping = {}
        for (let idx = 0; idx < columnCount; idx++) {
          initialMapping[idx] = ''
        }
        setMapping(initialMapping)
        
        setStep(2)
      } catch (err) {
        setError('Kunne ikke lese CSV-filen: ' + err.message)
      }
    }

    processFile()
  }

  const handleMappingChange = (columnIndex, fieldKey) => {
    setMapping(prev => ({
      ...prev,
      [columnIndex]: fieldKey
    }))
  }

  // Toggle om første rad er header eller data
  const toggleHeaderRow = (hasHeader) => {
    setHasHeaderRow(hasHeader)
    if (hasHeader) {
      // Første rad er header
      setHeaders(rawCsvData[0])
      setCsvData(rawCsvData.slice(1))
    } else {
      // Ingen header - generer kolonne-navn
      const columnCount = rawCsvData[0]?.length || 0
      setHeaders(Array.from({ length: columnCount }, (_, i) => `Kolonne ${i + 1}`))
      setCsvData(rawCsvData) // Alle rader er data
    }
  }

  const getMappedValue = (row, fieldKey) => {
    const columnIndex = Object.entries(mapping).find(([_, v]) => v === fieldKey)?.[0]
    if (columnIndex === undefined) return null
    return row[parseInt(columnIndex)] || null
  }

  const cleanOrgNr = (orgNr) => {
    if (!orgNr) return null
    // Fjern bokstaver, mellomrom og andre tegn
    return orgNr.replace(/[^0-9]/g, '')
  }

  const validateMapping = () => {
    const mappedFields = Object.values(mapping).filter(v => v)
    
    // Org.nr er valgfritt - rader uten blir "Privatkunder"
    // Men vi trenger minst ett felt for å identifisere kunden
    if (!mappedFields.includes('org_nr') && !mappedFields.includes('name')) {
      setError('Du må mappe enten Org.nr eller Kundenavn for å kunne importere')
      return false
    }
    
    if (periodType === 'month' && !importMonth) {
      setError('Du må velge måned for import')
      return false
    }
    
    if (periodType === 'week' && !importWeek) {
      setError('Du må velge uke for import')
      return false
    }
    
    setError('')
    return true
  }

  const handleImport = async () => {
    if (!validateMapping()) return
    
    setImporting(true)
    setImportResult(null)
    
    const results = {
      total: csvData.length,
      customersCreated: 0,
      customersUpdated: 0,
      salesCreated: 0,
      salesDeleted: 0,
      skippedZeroSales: 0,
      totalAmountImported: 0,
      totalProfitImported: 0,
      errors: []
    }

    // Beregn start og slutt basert på periodetype
    let periodStart, periodEnd, saleDate, importRef
    
    if (periodType === 'week') {
      // Uke-format: "2026-W02"
      const [weekYear, weekNum] = importWeek.split('-W')
      const year = parseInt(weekYear)
      const week = parseInt(weekNum)
      
      // Beregn første dag i uken (mandag)
      const jan4 = new Date(year, 0, 4)
      const dayOfWeek = jan4.getDay() || 7
      const firstMonday = new Date(jan4)
      firstMonday.setDate(jan4.getDate() - dayOfWeek + 1)
      
      const weekStart = new Date(firstMonday)
      weekStart.setDate(firstMonday.getDate() + (week - 1) * 7)
      
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      
      periodStart = weekStart.toISOString().split('T')[0]
      periodEnd = weekEnd.toISOString().split('T')[0]
      saleDate = periodEnd // Bruk siste dag i uken som salgsdato
      importRef = `import_${importWeek}`
    } else {
      // Måned-format: "2026-01"
      const [year, month] = importMonth.split('-')
      periodStart = `${importMonth}-01`
      periodEnd = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]
      saleDate = periodEnd // Bruk siste dag i måneden som salgsdato
      importRef = `import_${importMonth}`
    }

    try {
      // Først: Slett eksisterende salg for denne perioden (for denne tenant)
      if (!isDemoMode) {
        const { data: deletedSales, error: deleteError } = await supabase
          .from('sales')
          .delete()
          .eq('tenant_id', tenant.id)
          .gte('sale_date', periodStart)
          .lte('sale_date', periodEnd)
          .select('id')

        if (deleteError) {
          console.error('Feil ved sletting:', deleteError)
        } else {
          results.salesDeleted = deletedSales?.length || 0
        }
      }

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i]
        const orgNr = cleanOrgNr(getMappedValue(row, 'org_nr'))
        const customerName = getMappedValue(row, 'name')
        
        // Håndter privatkunder (manglende org.nr)
        const isPrivateCustomer = !orgNr

        try {
          // 1. Sjekk om kunde eksisterer
          let customerId = null
          
          if (isDemoMode) {
            // Demo-modus - simuler
            customerId = isPrivateCustomer ? 'demo-privatkunde' : `demo-customer-${orgNr}`
            results.customersCreated++
          } else {
            if (isPrivateCustomer) {
              // Privatkunde - finn eller opprett "Privatkunder" samle-kunde
              const { data: privateCustomer } = await supabase
                .from('customers')
                .select('id')
                .eq('tenant_id', tenant.id)
                .eq('name', 'Privatkunder')
                .is('org_nr', null)
                .single()

              if (privateCustomer) {
                customerId = privateCustomer.id
              } else {
                // Opprett "Privatkunder" kunde
                const { data: newPrivate, error: privateError } = await supabase
                  .from('customers')
                  .insert({
                    tenant_id: tenant.id,
                    name: 'Privatkunder',
                    notes: 'Samlet kategori for alle privatkunder uten org.nr'
                  })
                  .select('id')
                  .single()

                if (privateError) throw privateError
                customerId = newPrivate.id
                results.customersCreated++
              }
            } else {
              // Bedriftskunde med org.nr
              const { data: existingCustomer } = await supabase
                .from('customers')
                .select('id')
                .eq('tenant_id', tenant.id)
                .eq('org_nr', orgNr)
                .single()

              if (existingCustomer) {
                customerId = existingCustomer.id
                
                // Oppdater kunde med ny data fra CSV
                const updateData = {}
                const name = getMappedValue(row, 'name')
                const address = getMappedValue(row, 'address')
                const postalCode = getMappedValue(row, 'postal_code')
                const city = getMappedValue(row, 'city')
                const phone = getMappedValue(row, 'phone')
                const email = getMappedValue(row, 'email')
                
                if (name) updateData.name = name
                if (address) updateData.address = address
                if (postalCode) updateData.postal_code = postalCode
                if (city) updateData.city = city
                if (phone) updateData.phone = phone
                if (email) updateData.email = email
                
                if (Object.keys(updateData).length > 0) {
                  await supabase
                    .from('customers')
                    .update(updateData)
                    .eq('id', customerId)
                  results.customersUpdated++
                }
              } else {
                // 2. Opprett ny kunde - hent fra BRREG først
                let customerData = {
                  tenant_id: tenant.id,
                  org_nr: orgNr,
                  name: getMappedValue(row, 'name') || 'Ukjent',
                  address: getMappedValue(row, 'address'),
                  postal_code: getMappedValue(row, 'postal_code'),
                  city: getMappedValue(row, 'city'),
                  phone: getMappedValue(row, 'phone'),
                  email: getMappedValue(row, 'email'),
                  contact_person: getMappedValue(row, 'contact_person'),
                  contact_phone: getMappedValue(row, 'contact_phone'),
                  contact_email: getMappedValue(row, 'contact_email'),
                }

                // Prøv å hente ekstra info fra BRREG
                try {
                  const brregData = await searchByOrgNr(orgNr)
                  if (brregData) {
                    // Fyll inn data fra BRREG hvis ikke finnes i CSV
                    if (!customerData.name || customerData.name === 'Ukjent') {
                      customerData.name = brregData.navn
                    }
                    if (!customerData.address && brregData.forretningsadresse) {
                      customerData.address = brregData.forretningsadresse.adresse?.[0]
                      customerData.postal_code = brregData.forretningsadresse.postnummer
                      customerData.city = brregData.forretningsadresse.poststed
                    }
                    // Ekstra BRREG-data
                    customerData.industry = brregData.naeringskode1?.beskrivelse
                    customerData.employee_count = brregData.antallAnsatte?.toString()
                  }
                } catch (brregError) {
                  // Ignorer BRREG-feil, fortsett med CSV-data
                }

                const { data: newCustomer, error: customerError } = await supabase
                  .from('customers')
                  .insert(customerData)
                  .select('id')
                  .single()

                if (customerError) throw customerError
                customerId = newCustomer.id
                results.customersCreated++
              }
            }

            // 3. Opprett salgspost
            // parseNorwegianNumber håndterer norsk tallformat (1 234,56 eller 1.234,56)
            const parseNorwegianNumber = (str) => {
              if (!str) return 0
              // Fjern mellomrom og valutategn
              let cleaned = str.replace(/[\s\u00A0kr]/g, '').trim()
              // Sjekk om det er norsk format (komma som desimaltegn)
              if (cleaned.includes(',')) {
                // Fjern tusenskilletegn (punktum) og erstatt komma med punktum
                cleaned = cleaned.replace(/\./g, '').replace(',', '.')
              }
              // Fjern alt unntatt tall, punktum og minus
              cleaned = cleaned.replace(/[^0-9.-]/g, '')
              return parseFloat(cleaned) || 0
            }

            const totalSales = parseNorwegianNumber(getMappedValue(row, 'total_sales'))
            const totalCost = parseNorwegianNumber(getMappedValue(row, 'total_cost'))
            const totalProfit = parseNorwegianNumber(getMappedValue(row, 'total_profit')) || (totalSales - totalCost)

            if (totalSales > 0) {
              const periodLabel = periodType === 'week' ? importWeek : importMonth
              const { error: salesError } = await supabase
                .from('sales')
                .insert({
                  tenant_id: tenant.id,
                  customer_id: customerId,
                  amount: totalSales,
                  profit: totalProfit,
                  sale_date: saleDate,
                  description: isPrivateCustomer ? `Privatkunde - ${customerName || 'Ukjent'}` : `Import ${periodLabel}`,
                  import_ref: importRef
                })

              if (salesError) throw salesError
              results.salesCreated++
              results.totalAmountImported += totalSales
              results.totalProfitImported += totalProfit
            } else {
              results.skippedZeroSales++
            }
          }
        } catch (rowError) {
          results.errors.push(`Rad ${i + 2}: ${rowError.message}`)
        }
      }

      setImportResult(results)
      setStep(4)
    } catch (err) {
      setError('Import feilet: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  const resetImport = () => {
    setStep(1)
    setFile(null)
    setCsvData([])
    setHeaders([])
    setMapping({})
    setPeriodType('month')
    setImportMonth('')
    setImportWeek('')
    setImportResult(null)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="import-page">
      <div className="page-header">
        <h1>Importer salgsdata</h1>
        {step > 1 && step < 4 && (
          <Button variant="secondary" onClick={resetImport}>
            <RefreshCw size={16} />
            Start på nytt
          </Button>
        )}
      </div>

      {/* Progress indicator */}
      <div className="import-progress">
        <div className={`progress-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
          <span className="step-number">1</span>
          <span className="step-label">Last opp</span>
        </div>
        <div className="progress-line" />
        <div className={`progress-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
          <span className="step-number">2</span>
          <span className="step-label">Map kolonner</span>
        </div>
        <div className="progress-line" />
        <div className={`progress-step ${step >= 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}>
          <span className="step-number">3</span>
          <span className="step-label">Bekreft</span>
        </div>
        <div className="progress-line" />
        <div className={`progress-step ${step >= 4 ? 'active' : ''}`}>
          <span className="step-number">4</span>
          <span className="step-label">Ferdig</span>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardContent>
            <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileSelect}
                hidden
              />
              <Upload size={48} />
              <h3>Last opp CSV-fil</h3>
              <p>Klikk for å velge fil, eller dra og slipp</p>
              <span className="upload-hint">Støtter .csv og .txt filer</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Map columns */}
      {step === 2 && (
        <>
          {/* Template selector */}
          <Card className="template-card">
            <CardContent>
              <div className="template-section">
                <div className="template-load">
                  <label>Last inn mal:</label>
                  <select 
                    className="template-select"
                    onChange={(e) => {
                      const template = templates.find(t => t.id === e.target.value)
                      if (template) applyTemplate(template)
                    }}
                    defaultValue=""
                  >
                    <option value="">-- Velg lagret mal --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {templates.length > 0 && (
                    <div className="template-list-mini">
                      {templates.map(t => (
                        <button 
                          key={t.id}
                          className="template-delete-btn"
                          onClick={() => deleteTemplate(t.id)}
                          title={`Slett "${t.name}"`}
                        >
                          <Trash2 size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => setShowSaveTemplate(true)}
                >
                  <Save size={16} />
                  Lagre som mal
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3>
                <FileSpreadsheet size={20} />
                Forhåndsvisning ({Math.min(5, csvData.length)} av {csvData.length} rader)
              </h3>
            </CardHeader>
            <CardContent>
              {/* Header row toggle */}
              <div className="header-toggle">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={hasHeaderRow}
                    onChange={(e) => toggleHeaderRow(e.target.checked)}
                  />
                  <span>Første rad er kolonneoverskrifter (hopp over ved import)</span>
                </label>
                {hasHeaderRow && (
                  <span className="toggle-hint info">
                    ℹ️ Første rad hoppes over
                  </span>
                )}
              </div>

              <div className="preview-table-wrapper">
                <table className="preview-table">
                  <thead>
                    <tr>
                      {headers.map((header, idx) => (
                        <th key={idx}>
                          <div className="column-header">
                            <span className="column-name">{header || `Kolonne ${idx + 1}`}</span>
                            <select
                              value={mapping[idx] || ''}
                              onChange={(e) => handleMappingChange(idx, e.target.value)}
                              className="column-select"
                            >
                              {MAPPABLE_FIELDS.map(field => (
                                <option key={field.key} value={field.key}>
                                  {field.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 5).map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} title={cell}>
                            {cell?.length > 30 ? cell.substring(0, 30) + '...' : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3>Periode for import</h3>
            </CardHeader>
            <CardContent>
              <div className="period-selector">
                <div className="period-type-toggle">
                  <label className={`period-type-option ${periodType === 'month' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="periodType"
                      value="month"
                      checked={periodType === 'month'}
                      onChange={(e) => setPeriodType(e.target.value)}
                    />
                    <span>Måned</span>
                  </label>
                  <label className={`period-type-option ${periodType === 'week' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="periodType"
                      value="week"
                      checked={periodType === 'week'}
                      onChange={(e) => setPeriodType(e.target.value)}
                    />
                    <span>Uke</span>
                  </label>
                </div>
                
                {periodType === 'month' ? (
                  <Input
                    label="Velg måned"
                    type="month"
                    value={importMonth}
                    onChange={(e) => setImportMonth(e.target.value)}
                  />
                ) : (
                  <Input
                    label="Velg uke"
                    type="week"
                    value={importWeek}
                    onChange={(e) => setImportWeek(e.target.value)}
                  />
                )}
                
                <p className="period-hint">
                  {periodType === 'month' 
                    ? 'Eksisterende salgsdata for denne måneden vil bli erstattet ved import.'
                    : 'Eksisterende salgsdata for denne uken vil bli erstattet ved import. Andre uker påvirkes ikke.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="import-actions">
            <Button variant="secondary" onClick={resetImport}>
              Avbryt
            </Button>
            <Button onClick={() => validateMapping() && setStep(3)}>
              Neste
              <ArrowRight size={18} />
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <>
          <Card>
            <CardHeader>
              <h3>Bekreft import</h3>
            </CardHeader>
            <CardContent>
              {/* Forhåndsvisning av tall */}
              {(() => {
                const parseNorwegianNumber = (str) => {
                  if (!str) return 0
                  let cleaned = str.replace(/[\s\u00A0kr]/g, '').trim()
                  if (cleaned.includes(',')) {
                    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
                  }
                  cleaned = cleaned.replace(/[^0-9.-]/g, '')
                  return parseFloat(cleaned) || 0
                }

                // Analyser ALLE rader for å finne problemer
                const allRowsAnalysis = csvData.map((row, idx) => ({
                  rowNum: idx + 2, // +2 fordi rad 1 er header
                  name: getMappedValue(row, 'name') || getMappedValue(row, 'org_nr') || 'Ukjent',
                  salesRaw: getMappedValue(row, 'total_sales'),
                  salesParsed: parseNorwegianNumber(getMappedValue(row, 'total_sales')),
                  profitRaw: getMappedValue(row, 'total_profit'),
                  profitParsed: parseNorwegianNumber(getMappedValue(row, 'total_profit'))
                }))

                // Finn rader med 0 omsetning
                const zeroSalesRows = allRowsAnalysis
                  .filter(r => r.salesParsed === 0)
                  .map(r => r.rowNum)

                // Vis de 5 første + eventuelle problemrader
                const previewRows = allRowsAnalysis.slice(0, 5)

                const totalParsed = allRowsAnalysis.reduce((sum, r) => sum + r.salesParsed, 0)

                const formatCurrency = (n) => new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n)

                return (
                  <div className="number-preview">
                    <h4>Forhåndsvisning av tall (sjekk at disse er riktige!)</h4>
                    <table className="preview-table compact">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Kunde</th>
                          <th>Omsetning (rådata)</th>
                          <th>Omsetning (tolket)</th>
                          <th>Fortjeneste (rådata)</th>
                          <th>Fortjeneste (tolket)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, idx) => (
                          <tr key={idx} className={row.salesParsed === 0 && row.salesRaw ? 'row-warning' : ''}>
                            <td>{row.rowNum}</td>
                            <td>{row.name}</td>
                            <td className="raw-value">{row.salesRaw || '-'}</td>
                            <td className={`parsed-value ${row.salesParsed === 0 && row.salesRaw ? 'parse-error' : ''}`}>
                              {formatCurrency(row.salesParsed)}
                            </td>
                            <td className="raw-value">{row.profitRaw || '-'}</td>
                            <td className="parsed-value">{formatCurrency(row.profitParsed)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan="3"><strong>Estimert total for alle {csvData.length} rader:</strong></td>
                          <td colSpan="3"><strong>{formatCurrency(totalParsed)}</strong></td>
                        </tr>
                        {zeroSalesRows.length > 0 && (
                          <tr className="info-row">
                            <td colSpan="6">
                              ℹ️ {zeroSalesRows.length} rader med 0 kr omsetning hoppes over
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>
                )
              })()}

              <div className="confirm-summary">
                <div className="summary-item">
                  <span className="summary-label">Fil:</span>
                  <span className="summary-value">{file?.name}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Antall rader:</span>
                  <span className="summary-value">{csvData.length}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Måned:</span>
                  <span className="summary-value">
                    {new Date(importMonth + '-01').toLocaleDateString('nb-NO', { year: 'numeric', month: 'long' })}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Mappede felt:</span>
                  <span className="summary-value">
                    {Object.values(mapping).filter(v => v).map(key => 
                      MAPPABLE_FIELDS.find(f => f.key === key)?.label
                    ).join(', ')}
                  </span>
                </div>
              </div>

              <div className="confirm-info warning">
                <AlertCircle size={18} />
                <p>
                  <strong>OBS:</strong> Eksisterende salgsdata for denne måneden vil bli slettet og erstattet med ny data.
                  Nye kunder opprettes automatisk basert på org.nr.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="import-actions">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Tilbake
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 size={18} className="spinner" />
                  Importerer...
                </>
              ) : (
                <>
                  <Check size={18} />
                  Start import
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* Step 4: Results */}
      {step === 4 && importResult && (
        <Card>
          <CardHeader>
            <h3>
              <Check size={20} className="success-icon" />
              Import fullført!
            </h3>
          </CardHeader>
          <CardContent>
            <div className="result-summary">
              <div className="result-item success">
                <span className="result-number">{importResult.customersCreated}</span>
                <span className="result-label">Nye kunder opprettet</span>
              </div>
              <div className="result-item info">
                <span className="result-number">{importResult.customersUpdated}</span>
                <span className="result-label">Kunder oppdatert</span>
              </div>
              {importResult.salesDeleted > 0 && (
                <div className="result-item warning">
                  <span className="result-number">{importResult.salesDeleted}</span>
                  <span className="result-label">Gamle salgsposter fjernet</span>
                </div>
              )}
              <div className="result-item success">
                <span className="result-number">{importResult.salesCreated}</span>
                <span className="result-label">Nye salgsposter opprettet</span>
              </div>
              {importResult.skippedZeroSales > 0 && (
                <div className="result-item warning">
                  <span className="result-number">{importResult.skippedZeroSales}</span>
                  <span className="result-label">Hoppet over (0 kr omsetning)</span>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="result-item error">
                  <span className="result-number">{importResult.errors.length}</span>
                  <span className="result-label">Feil</span>
                </div>
              )}
            </div>

            {/* Totaler */}
            <div className="import-totals">
              <div className="total-item">
                <span className="total-label">Total omsetning importert:</span>
                <span className="total-value">
                  {new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(importResult.totalAmountImported)}
                </span>
              </div>
              <div className="total-item">
                <span className="total-label">Total fortjeneste importert:</span>
                <span className="total-value">
                  {new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(importResult.totalProfitImported)}
                </span>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="error-list">
                <h4>Feil under import:</h4>
                <ul>
                  {importResult.errors.slice(0, 10).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                  {importResult.errors.length > 10 && (
                    <li>...og {importResult.errors.length - 10} flere feil</li>
                  )}
                </ul>
              </div>
            )}

            <div className="import-actions">
              <Button onClick={resetImport}>
                <RefreshCw size={18} />
                Ny import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Template Modal */}
      <Modal
        isOpen={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        title="Lagre mapping som mal"
      >
        <div className="save-template-form">
          <Input
            label="Navn på mal"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="F.eks. PoS Salgsstatistikk"
            autoFocus
          />
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowSaveTemplate(false)}>
              Avbryt
            </Button>
            <Button onClick={saveTemplate} disabled={savingTemplate || !templateName.trim()}>
              {savingTemplate ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  Lagrer...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Lagre mal
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
