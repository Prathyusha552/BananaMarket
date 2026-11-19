
import { useEffect, useState } from 'react'
import './App.css'

import SellerData from './SellerData'
import BuyerData from './BuyerData'
import PreAuction from './PreAuction'
import AuctionForm from './AuctionForm'
import StockManagement from './StockManagement'
import SellerSlip from './SellerSlip'
import SellerPaymentSlip from './SellerPaymentSlip'
import BuyerSlip from './BuyerSlip'

const API = 'http://localhost:8080/api'

function App() {
  const [authLoading, setAuthLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [username, setUsername] = useState('admin')

  useEffect(() => {
    async function checkAuthentication() {
      try {
        const statusResponse = await fetch(`${API}/auth/status`, {
          credentials: 'include'
        })

        if (!statusResponse.ok) {
          throw new Error('Unable to check administrator setup.')
        }

        const status = await statusResponse.json()
        setSetupRequired(status.setupRequired)

        if (!status.setupRequired) {
          const sessionResponse = await fetch(`${API}/auth/me`, {
            credentials: 'include'
          })

          if (sessionResponse.ok) {
            const user = await sessionResponse.json()
            setUsername(user.username)
            setAuthenticated(true)
          }
        }
      } catch (error) {
        console.error(error)
        alert('Cannot connect to the backend. Please check that it is running.')
      } finally {
        setAuthLoading(false)
      }
    }

    checkAuthentication()
  }, [])

  if (authLoading) {
    return <AuthMessage message="Loading Banana Market..." />
  }

  if (!authenticated) {
    return (
      <AuthScreen
        setupRequired={setupRequired}
        onSuccess={(user) => {
          setUsername(user)
          setAuthenticated(true)
          setSetupRequired(false)
        }}
      />
    )
  }

  return (
    <MarketApplication
      username={username}
      onLogout={() => {
        setAuthenticated(false)
        setUsername('admin')
      }}
    />
  )
}

function AuthMessage({ message }) {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.heading}>Banana Market</h2>
        <p>{message}</p>
      </div>
    </div>
  )
}

function AuthScreen({ setupRequired, onSuccess }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (password.length < 10) {
      setError('Password must contain at least 10 characters.')
      return
    }

    if (setupRequired && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const endpoint = setupRequired ? 'setup' : 'login'

      const response = await fetch(`${API}/auth/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'admin',
          password
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Authentication failed.')
      }

      setPassword('')
      setConfirmPassword('')
      onSuccess(result.username || 'admin')
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>BM</div>

        <h1 style={styles.heading}>Banana Market</h1>

        <p style={styles.subtitle}>
          Management System
        </p>

        <div style={styles.divider} />

        <h2 style={styles.formHeading}>
          {setupRequired ? 'Create Administrator Account' : 'Administrator Login'}
        </h2>

        <p style={styles.description}>
          {setupRequired
            ? 'Create your administrator password to set up the system.'
            : 'Enter your administrator password to continue.'}
        </p>

        <form onSubmit={submit}>
          <label style={styles.label}>Username</label>

          <input
            type="text"
            value="admin"
            readOnly
            style={styles.input}
          />

          <label style={styles.label}>Password</label>

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            autoComplete={setupRequired ? 'new-password' : 'current-password'}
            required
            minLength={10}
            style={styles.input}
          />

          {setupRequired && (
            <>
              <label style={styles.label}>Confirm Password</label>

              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Enter password again"
                autoComplete="new-password"
                required
                minLength={10}
                style={styles.input}
              />
            </>
          )}

          {error && (
            <p style={styles.error}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={styles.button}
          >
            {loading
              ? 'Please wait...'
              : setupRequired
                ? 'Create Admin Account'
                : 'Login'}
          </button>
        </form>

        <p style={styles.footer}>
          Secure Administrator Access
        </p>
      </div>
    </div>
  )
}

function MarketApplication({ username, onLogout }) {
  const [activePage, setActivePage] = useState('Dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)

  const menuItems = [
    { name: 'Dashboard', number: '01' },
    { name: 'Auction Form', number: '02' },
    { name: 'Seller Data', number: '03' },
    { name: 'Buyer Data', number: '04' },
    { name: 'Pre-Auction', number: '05' },
    { name: 'Stock Management', number: '06' },
    { name: 'Buyer Slip', number: '07' },
    { name: 'Seller Slip', number: '08' },
    { name: 'Seller Payment Slip', number: '09' }
  ]

  const navigateToPage = (page) => {
    setActivePage(page)
    setMobileMenuOpen(false)
  }

  async function handleLogout() {
    setLogoutLoading(true)

    try {
      const response = await fetch(`${API}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Unable to log out.')
      }

      onLogout()
    } catch (error) {
      alert(error.message)
    } finally {
      setLogoutLoading(false)
    }
  }

  const renderPage = () => {
    switch (activePage) {
      case 'Dashboard':
        return <Dashboard onNavigate={navigateToPage} />
      case 'Auction Form':
        return <AuctionForm />
      case 'Seller Data':
        return <SellerData />
      case 'Buyer Data':
        return <BuyerData />
      case 'Pre-Auction':
        return <PreAuction />
      case 'Stock Management':
        return <StockManagement />
      case 'Buyer Slip':
        return <BuyerSlip />
      case 'Seller Slip':
        return <SellerSlip />
      case 'Seller Payment Slip':
        return <SellerPaymentSlip />
      default:
        return <Dashboard onNavigate={navigateToPage} />
    }
  }

  return (
    <div className="app-container">
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon">BM</div>
          <div>
            <h2>Banana Market</h2>
            <p>Management System</p>
          </div>
        </div>

        <div className="sidebar-menu">
          <p className="menu-heading">MAIN MENU</p>

          {menuItems.map((item) => (
            <button
              key={item.name}
              type="button"
              className={`menu-item ${activePage === item.name ? 'active' : ''}`}
              onClick={() => navigateToPage(item.name)}
            >
              <span className="menu-icon">{item.number}</span>
              <span>{item.name}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <p>Banana Market</p>
          <small>Management System v1.0</small>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <main className="main-content">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            ☰
          </button>

          <div className="topbar-title">
            <h3>{activePage}</h3>
            <p>Banana Market Management System</p>
          </div>

          <div className="topbar-right">
            <span className="admin-badge">
              Administrator: {username}
            </span>

            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutLoading}
              style={styles.logoutButton}
            >
              {logoutLoading ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </header>

        <section className="page-content">
          {renderPage()}
        </section>
      </main>
    </div>
  )
}

function Dashboard({ onNavigate }) {
  const dashboardItems = [
    {
      name: 'Auction Form',
      number: '01',
      description: 'Enter daily auction sales, quantities and selling prices.'
    },
    {
      name: 'Seller Data',
      number: '02',
      description: 'View and manage farmer information.'
    },
    {
      name: 'Buyer Data',
      number: '03',
      description: 'View and manage buyer information.'
    },
    {
      name: 'Pre-Auction',
      number: '04',
      description: 'Register farmers and quantities for auction.'
    },
    {
      name: 'Stock Management',
      number: '05',
      description: 'Manage deliveries, lots and remaining stock.'
    },
    {
      name: 'Buyer Slip',
      number: '06',
      description: 'View and print buyer purchase slips.'
    },
    {
      name: 'Seller Slip',
      number: '07',
      description: 'View detailed farmer delivery settlements.'
    },
    {
      name: 'Seller Payment Slip',
      number: '08',
      description: 'View and print simple farmer payment summaries.'
    }
  ]

  return (
    <div className="dashboard">
      <div className="welcome-section">
        <p className="dashboard-eyebrow">MARKET MANAGEMENT</p>
        <h2>Welcome to Banana Market</h2>
        <p>
          Manage daily auction activities, farmers, buyers, deliveries
          and settlements from one place.
        </p>
      </div>

      <div className="dashboard-section-heading">
        <div>
          <h3>Management Modules</h3>
          <p>Select a module to continue.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {dashboardItems.map((item) => (
          <button
            key={item.name}
            type="button"
            className="dashboard-card dashboard-card-button"
            onClick={() => onNavigate(item.name)}
          >
            <span className="dashboard-card-number">{item.number}</span>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <span className="dashboard-card-link">Open module →</span>
          </button>
        ))}
      </div>

      <div className="dashboard-note">
        <h3>System Information</h3>
        <p>
          Banana Market Management System is connected to the
          application database through the Spring Boot backend.
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: '#f2f5f3',
    padding: '20px',
    fontFamily: 'Arial, sans-serif'
  },
  card: {
    width: '100%',
    maxWidth: '430px',
    background: '#ffffff',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
    textAlign: 'center'
  },
  logo: {
    width: '58px',
    height: '58px',
    margin: '0 auto 12px',
    borderRadius: '12px',
    background: '#17352b',
    color: '#ffffff',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 'bold',
    fontSize: '20px'
  },
  heading: {
    color: '#17352b',
    margin: '0 0 6px'
  },
  subtitle: {
    color: '#777777',
    margin: 0
  },
  divider: {
    height: '1px',
    background: '#eeeeee',
    margin: '24px 0'
  },
  formHeading: {
    color: '#17352b',
    fontSize: '21px',
    marginBottom: '8px'
  },
  description: {
    color: '#777777',
    fontSize: '14px',
    marginBottom: '24px'
  },
  label: {
    display: 'block',
    textAlign: 'left',
    fontWeight: 'bold',
    fontSize: '14px',
    margin: '14px 0 7px',
    color: '#333333'
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px',
    border: '1px solid #cccccc',
    borderRadius: '6px',
    fontSize: '15px'
  },
  button: {
    width: '100%',
    padding: '13px',
    marginTop: '22px',
    background: '#17352b',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  error: {
    color: '#b42318',
    background: '#fff1f0',
    padding: '10px',
    borderRadius: '6px',
    fontSize: '13px',
    textAlign: 'left'
  },
  footer: {
    color: '#888888',
    fontSize: '12px',
    marginTop: '24px'
  },
  logoutButton: {
    marginLeft: '10px',
    padding: '8px 12px',
    border: '1px solid #17352b',
    borderRadius: '5px',
    background: '#ffffff',
    color: '#17352b',
    cursor: 'pointer'
  }
}

export default App
