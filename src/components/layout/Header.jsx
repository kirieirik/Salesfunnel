import { LogOut, User, Menu, FlaskConical } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { isDemoMode } from '../../lib/supabase'

export default function Header({ onMenuToggle }) {
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <header className="header">
      <button className="menu-toggle" onClick={onMenuToggle}>
        <Menu size={24} />
      </button>
      
      {isDemoMode && (
        <div className="demo-badge">
          <FlaskConical size={16} />
          Demo-modus
        </div>
      )}

      <div className="header-right">
        <div className="user-info">
          <User size={18} />
          <span>{user?.email}</span>
        </div>
        <button onClick={handleSignOut} className="btn-icon" title="Logg ut">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  )
}
