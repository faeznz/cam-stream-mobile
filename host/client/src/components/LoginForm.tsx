import { useState } from 'react'

export default function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const credentials = btoa(`${username}:${password}`)
      const response = await fetch('/api/devices', { headers: { Authorization: `Basic ${credentials}` } })
      if (response.status === 401) { setError('Nama pengguna atau kata sandi tidak sesuai.'); return }
      if (!response.ok) throw new Error('Login failed')
      localStorage.setItem('cam_auth', credentials)
      onLogin()
    } catch {
      setError('Belum dapat masuk. Periksa koneksi Anda lalu coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-shell">
      <div className="login-panel">
        <a href="/" className="app-brand" aria-label="Cam Stream, halaman utama">Cam<span>Stream</span></a>
        <h1>Masuk ke monitor kamera</h1>
        <p>Kelola HP yang terhubung dan pantau beberapa kamera dalam satu layar.</p>
        <form onSubmit={handleSubmit} aria-busy={busy}>
          <div className="login-field"><label htmlFor="username">Nama pengguna</label><input id="username" name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></div>
          <div className="login-field"><label htmlFor="password">Kata sandi</label><input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></div>
          {error && <p role="alert" className="notice notice-error">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy || !username || !password}>{busy ? 'Memeriksa akun…' : 'Masuk ke dashboard'}</button>
        </form>
      </div>
      <p className="login-caption">Cam Stream · Monitor kamera Android</p>
    </main>
  )
}
