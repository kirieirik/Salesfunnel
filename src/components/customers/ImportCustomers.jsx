import { useState, useRef } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '../common'
import './ImportCustomers.css'

export default function ImportCustomers({ onImport, onCancel }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1) // 1: Upload, 2: Map, 3: Confirm
  const fileInputRef = useRef(null)

  const availableFields = [
    { key: 'name', label: 'Navn', required: true },
    { key: 'org_nr', label: 'Org.nr', required: false },
    { key: 'email', label: 'E-post', required: false },
    { key: 'phone', label: 'Telefon', required: false },
    { key: 'address', label: 'Adresse', required: false },
    { key: 'notes', label: 'Notater', required: false }
  ]

  const parseCSV = (text) => {
    const lines = text.trim().split('\n')
    const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map(line => {
      const values = line.split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''))
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index] || ''
        return obj
      }, {})
    })
    return { headers, rows }
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setError('')

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const { headers, rows } = parseCSV(event.target.result)
        setHeaders(headers)
        setPreview(rows.slice(0, 5))
        
        // Auto-map headers
        const autoMapping = {}
        headers.forEach(header => {
          const lowerHeader = header.toLowerCase()
          if (lowerHeader.includes('navn') || lowerHeader === 'name') {
            autoMapping[header] = 'name'
          } else if (lowerHeader.includes('org') || lowerHeader.includes('bedrift')) {
            autoMapping[header] = 'org_nr'
          } else if (lowerHeader.includes('epost') || lowerHeader.includes('e-post') || lowerHeader === 'email') {
            autoMapping[header] = 'email'
          } else if (lowerHeader.includes('telefon') || lowerHeader.includes('tlf') || lowerHeader === 'phone') {
            autoMapping[header] = 'phone'
          } else if (lowerHeader.includes('adresse') || lowerHeader === 'address') {
            autoMapping[header] = 'address'
          }
        })
        setMapping(autoMapping)
        setStep(2)
      } catch (err) {
        setError('Kunne ikke lese filen. Sjekk at det er en gyldig CSV-fil.')
      }
    }
    reader.readAsText(selectedFile)
  }

  const handleMappingChange = (header, field) => {
    setMapping(prev => {
      const newMapping = { ...prev }
      if (field === '') {
        delete newMapping[header]
      } else {
        newMapping[header] = field
      }
      return newMapping
    })
  }

  const getMappedData = () => {
    const reader = new FileReader()
    return new Promise((resolve) => {
      reader.onload = (event) => {
        const { rows } = parseCSV(event.target.result)
        const mappedRows = rows.map(row => {
          const mapped = {}
          Object.entries(mapping).forEach(([header, field]) => {
            if (row[header]) {
              mapped[field] = row[header]
            }
          })
          return mapped
        }).filter(row => row.name) // Filtrer ut rader uten navn
        resolve(mappedRows)
      }
      reader.readAsText(file)
    })
  }

  const handleImport = async () => {
    if (!Object.values(mapping).includes('name')) {
      setError('Du må mappe minst "Navn"-feltet')
      return
    }

    setLoading(true)
    setError('')

    try {
      const customers = await getMappedData()
      
      if (customers.length === 0) {
        setError('Ingen gyldige kunder å importere')
        setLoading(false)
        return
      }

      const { error } = await onImport(customers)
      
      if (error) {
        setError(error.message)
      }
    } catch (err) {
      setError('En feil oppstod under import')
    }
    
    setLoading(false)
  }

  return (
    <div className="import-customers">
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="upload-step">
          <div 
            className="upload-area"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={48} />
            <h3>Last opp CSV-fil</h3>
            <p>Klikk eller dra og slipp en CSV-fil her</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              hidden
            />
          </div>
          
          <div className="upload-help">
            <h4>Forventet format</h4>
            <p>CSV-fil med kolonner separert med komma eller semikolon.</p>
            <p>Første rad skal inneholde kolonnenavn.</p>
            <code>Navn,Org.nr,E-post,Telefon,Adresse</code>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mapping-step">
          <div className="file-info">
            <FileText size={20} />
            <span>{file?.name}</span>
            <Button size="sm" variant="secondary" onClick={() => setStep(1)}>
              Bytt fil
            </Button>
          </div>

          <h4>Koble kolonner til felt</h4>
          <div className="mapping-grid">
            {headers.map(header => (
              <div key={header} className="mapping-row">
                <span className="header-name">{header}</span>
                <span>→</span>
                <select
                  value={mapping[header] || ''}
                  onChange={(e) => handleMappingChange(header, e.target.value)}
                  className="input"
                >
                  <option value="">Ignorer</option>
                  {availableFields.map(field => (
                    <option key={field.key} value={field.key}>
                      {field.label} {field.required && '*'}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <h4>Forhåndsvisning</h4>
          <div className="preview-table-wrapper">
            <table className="preview-table">
              <thead>
                <tr>
                  {headers.map(h => (
                    <th key={h} className={mapping[h] ? 'mapped' : ''}>
                      {h}
                      {mapping[h] && <small>→ {mapping[h]}</small>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {headers.map(h => (
                      <td key={h}>{row[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="modal-actions">
            <Button variant="secondary" onClick={onCancel}>
              Avbryt
            </Button>
            <Button onClick={handleImport} loading={loading}>
              <CheckCircle size={18} />
              Importer kunder
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
