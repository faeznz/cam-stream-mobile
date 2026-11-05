import { useState } from 'react'
import Login from './components/LoginForm'
import Dashboard from './components/Dashboard'

export default function App() {
  const [view, setView] = useState<'login' | 'dashboard'>('login')
  return (
    <div className="min-h-screen">
      {view === 'login' ? (
        <Login onLogin={() => setView('dashboard')} />
      ) : (
        <Dashboard onLogout={() => setView('login')} />
      )}
    </div>
  )
}
