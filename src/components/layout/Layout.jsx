import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTenant } from '../../contexts/TenantContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, isDemoMode } from '../../lib/supabase'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const { user } = useAuth()
  const { profile, tenant, loading } = useTenant()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [checkingOnboarding, setCheckingOnboarding] = useState(true)

  useEffect(() => {
    const checkOnboardingNeeded = async () => {
      if (loading || isDemoMode) {
        setCheckingOnboarding(false)
        return
      }

      console.log('Layout: Checking onboarding needed', {
        profile: profile?.first_name,
        tenant: tenant?.name,
        email: user?.email
      })

      // Sjekk om bruker mangler profil (navn)
      const needsProfile = !profile?.first_name || !profile?.last_name
      
      // Sjekk om bruker mangler tenant
      const needsTenant = !tenant
      
      // Sjekk om bruker har pending invitasjon via RPC (bypasses RLS)
      let hasPendingInvite = false
      if (user?.email && !tenant) {
        try {
          const { data: inviteResult } = await supabase
            .rpc('check_pending_invitation', { user_email: user.email.toLowerCase() })
          
          hasPendingInvite = inviteResult?.has_invitation === true
          console.log('Layout: Pending invite check via RPC:', inviteResult)
        } catch (err) {
          console.log('Layout: Error checking pending invite:', err)
        }
      }

      console.log('Layout: Onboarding check results', {
        needsProfile,
        needsTenant,
        hasPendingInvite
      })

      // Hvis bruker trenger onboarding, redirect
      if (needsProfile || needsTenant || hasPendingInvite) {
        // Behold invite token hvis det finnes i URL
        const params = new URLSearchParams(location.search)
        const inviteToken = params.get('invite')
        console.log('Layout: Redirecting to onboarding, token:', inviteToken)
        navigate(inviteToken ? `/onboarding?invite=${inviteToken}` : '/onboarding', { replace: true })
      }
      
      setCheckingOnboarding(false)
    }

    checkOnboardingNeeded()
  }, [user, profile, tenant, loading, navigate, location.search])

  if (checkingOnboarding || loading) {
    return <div className="loading-screen">Laster...</div>
  }

  return (
    <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar />
      <div className="main-content">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
      {sidebarOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}
    </div>
  )
}
