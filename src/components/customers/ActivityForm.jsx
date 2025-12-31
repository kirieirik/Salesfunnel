import { useState } from 'react'
import { Button, Input } from '../common'

export default function ActivityForm({ onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    type: 'note',
    description: '',
    content: '',
    activity_date: new Date().toISOString().split('T')[0]
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const activityTypes = [
    { value: 'note', label: 'Notat' },
    { value: 'call', label: 'Samtale' },
    { value: 'email', label: 'E-post' },
    { value: 'meeting', label: 'Møte' }
  ]

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
    <form onSubmit={handleSubmit} className="activity-form">
      {error && <div className="alert alert-error">{error}</div>}
      
      <div className="form-row">
        <div className="input-group">
          <label htmlFor="type">Type *</label>
          <select
            id="type"
            name="type"
            value={formData.type}
            onChange={handleChange}
            className="input"
            required
          >
            {activityTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Dato *"
          type="date"
          name="activity_date"
          value={formData.activity_date}
          onChange={handleChange}
          required
        />
      </div>

      <Input
        label="Beskrivelse *"
        name="description"
        value={formData.description}
        onChange={handleChange}
        required
        placeholder="Kort beskrivelse av aktiviteten"
      />

      <div className="input-group">
        <label htmlFor="content">Innhold / Detaljer</label>
        <textarea
          id="content"
          name="content"
          value={formData.content}
          onChange={handleChange}
          rows={4}
          placeholder="Detaljert innhold (f.eks. e-postinnhold, møtenotater, etc.)"
          className="input"
        />
      </div>

      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel} type="button">
          Avbryt
        </Button>
        <Button type="submit" loading={loading}>
          Lagre aktivitet
        </Button>
      </div>
    </form>
  )
}
