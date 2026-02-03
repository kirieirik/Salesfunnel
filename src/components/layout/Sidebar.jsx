import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  BarChart3,
  TrendingUp,
  Settings,
  CalendarDays,
  FileUp
} from 'lucide-react'
import { useTenant } from '../../contexts/TenantContext'

export default function Sidebar() {
  const { tenant } = useTenant()

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/calendar', icon: CalendarDays, label: 'Kalender' },
    { to: '/customers', icon: Users, label: 'Kunder' },
    { to: '/statistics', icon: BarChart3, label: 'Statistikk' },
    { to: '/budget', icon: TrendingUp, label: 'Budsjett' },
    { to: '/import', icon: FileUp, label: 'Importer' },
    { to: '/settings', icon: Settings, label: 'Innstillinger' },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="logo">Salesfunnel</h1>
      </div>

      {/* Current Tenant */}
      {tenant && (
        <div className="org-display">
          <Building2 size={18} />
          <span className="org-name">{tenant.name}</span>
        </div>
      )}

      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink 
            key={to} 
            to={to} 
            className={({ isActive }) => 
              `nav-item ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
