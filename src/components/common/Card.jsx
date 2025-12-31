export default function Card({ children, className = '', ...props }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '', onClick, ...props }) {
  return (
    <div className={`card-header ${className}`} onClick={onClick} {...props}>
      {children}
    </div>
  )
}

export function CardContent({ children, className = '' }) {
  return (
    <div className={`card-content ${className}`}>
      {children}
    </div>
  )
}
