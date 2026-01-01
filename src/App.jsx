import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { TenantProvider, useTenant } from './contexts/TenantContext'

// Layout
import Layout from './components/layout/Layout'

// Pages
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Onboarding from './pages/auth/Onboarding'
import Dashboard from './pages/Dashboard'
import Calendar from './pages/Calendar'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Statistics from './pages/Statistics'
import Settings from './pages/Settings'
import Import from './pages/Import'

// Wrapper som sjekker om bruker har tenant og komplett profil
function RequireTenant({ children }) {
  const { tenant, profile, loading } = useTenant()

  if (loading) {
    return <div className="loading-screen">Laster...</div>
  }

  // Hvis bruker ikke har komplett profil eller tenant, vis onboarding
  if (!profile?.first_name || !profile?.last_name || !tenant) {
    return <Onboarding />
  }

  return children
}

// Protected Route Wrapper
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="loading-screen">Laster...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <TenantProvider>
      <RequireTenant>{children}</RequireTenant>
    </TenantProvider>
  )
}

// Public Route Wrapper (redirects to home if logged in)
function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="loading-screen">Laster...</div>
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return children
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } />
          <Route path="/register" element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          } />

          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="statistics" element={<Statistics />} />
            <Route path="import" element={<Import />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
