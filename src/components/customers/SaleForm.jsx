import { useState } from 'react'
import { Button, Input } from '../common'

export default function SaleForm({ onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    sale_date: new Date().toISOString().split('T')[0],
    notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const submitData = {
      ...formData,
      amount: parseFloat(formData.amount)
    }

    const { error } = await onSubmit(submitData)
    
    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="sale-form">
      {error && <div className="alert alert-error">{error}</div>}
      
      <Input
        label="Beskrivelse *"
        name="description"
        value={formData.description}
        onChange={handleChange}
        required
        placeholder="Hva ble solgt?"
      />

      <div className="form-row">
        <Input
          label="Beløp (NOK) *"
          type="number"
          name="amount"
          value={formData.amount}
          onChange={handleChange}
          required
          min="0"
          step="0.01"
          placeholder="10000"
        />

        <Input
          label="Dato *"
          type="date"
          name="sale_date"
          value={formData.sale_date}
          onChange={handleChange}
          required
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
          placeholder="Eventuelle notater om salget..."
          className="input"
        />
      </div>

      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel} type="button">
          Avbryt
        </Button>
        <Button type="submit" loading={loading}>
          Registrer salg
        </Button>
      </div>
    </form>
  )
}
