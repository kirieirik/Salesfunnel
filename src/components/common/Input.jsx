export default function Input({
  label,
  error,
  type = 'text',
  id,
  className = '',
  ...props
}) {
  return (
    <div className={`input-group ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        type={type}
        id={id}
        className={`input ${error ? 'input-error' : ''}`}
        {...props}
      />
      {error && <span className="input-error-text">{error}</span>}
    </div>
  )
}
