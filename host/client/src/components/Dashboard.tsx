import { useEffect, useState } from 'react'
import DeviceList from './DeviceList'

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [devices, setDevices] = useState<Array<{ deviceId: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`

  useEffect(() => {
    let disposed = false
    async function loadDevices() {
      const auth = localStorage.getItem('cam_auth')
      if (!auth) { onLogout(); return }
      try {
        const response = await fetch('/api/devices', { headers: { Authorization: `Basic ${auth}` } })
        if (disposed) return
        if (response.status === 401) { localStorage.removeItem('cam_auth'); onLogout(); return }
        if (!response.ok) throw new Error('Unable to load devices')
        const data = await response.json()
        if (disposed) return
        setDevices(data.devices || [])
        setError('')
      } catch {
        if (!disposed) setError('Daftar HP belum dapat diperbarui. Mencoba lagi setiap 5 detik.')
      } finally {
        if (!disposed) setLoading(false)
      }
    }
    void loadDevices()
    const timer = setInterval(loadDevices, 5000)
    return () => { disposed = true; clearInterval(timer) }
  }, [onLogout])

  async function copyUrl() {
    try { await navigator.clipboard.writeText(wsUrl); setCopyStatus('Alamat berhasil disalin.') }
    catch { setCopyStatus('Tidak dapat menyalin otomatis. Pilih dan salin alamat di atas.') }
  }

  return (
    <div className="dashboard-shell">
      <header className="app-header">
        <a href="/" className="app-brand" aria-label="Cam Stream, halaman utama">Cam<span>Stream</span></a>
        <button className="button button-quiet" onClick={() => { localStorage.removeItem('cam_auth'); onLogout() }}>Keluar</button>
      </header>
      <main className="dashboard-main">
        <section className="page-heading" aria-labelledby="page-title">
          <div>
            <p className="section-label">Monitor kamera</p>
            <h1 id="page-title">Semua sudut, satu layar.</h1>
            <p className="page-description">Hubungkan HP, lalu pantau kameranya dari sini.</p>
          </div>
          <button className="button button-primary" aria-expanded={adding} aria-controls="add-device" onClick={() => setAdding(!adding)}>
            {adding ? 'Tutup petunjuk' : 'Tambah HP'}
          </button>
        </section>

        {adding && (
          <section id="add-device" className="setup-panel" aria-labelledby="setup-title">
            <div className="setup-instructions">
              <h2 id="setup-title">Hubungkan HP berikutnya</h2>
              <ol>
                <li>Unduh dan pasang APK Cam Stream di setiap HP Android.</li>
                <li>Buka aplikasi dan beri nama yang mudah dikenali, misalnya sesuai lokasi kamera.</li>
                <li>Gunakan alamat di samping, lalu tekan Aktifkan kamera. HP akan muncul otomatis di daftar.</li>
                <li>Tekan Nyalakan pada kamera yang dipilih dan izinkan akses kamera serta mikrofon di HP.</li>
              </ol>
              <a className="button button-secondary" href="/downloads/cam-stream-mobile.apk?v=2" download>Unduh APK Android</a>
            </div>
            <div className="connection-address">
              <label htmlFor="ws-address">Alamat koneksi HP</label>
              <input id="ws-address" value={wsUrl} readOnly onFocus={event => event.target.select()} />
              <button className="button button-secondary" onClick={copyUrl}>Salin alamat</button>
              <p role="status">{copyStatus || 'Alamat yang sama digunakan untuk semua HP. Setiap HP mendapat ID sendiri.'}</p>
            </div>
          </section>
        )}

        {error && <p role="alert" className="notice notice-error">{error}</p>}
        {loading ? (
          <section className="empty-state" role="status"><h2>Memuat kamera…</h2><p>Mengambil daftar HP yang terhubung.</p></section>
        ) : (
          <DeviceList devices={devices} onAddDevice={() => setAdding(true)} />
        )}
        <footer className="dashboard-footer">Video dikirim langsung dari HP. Daftar perangkat diperbarui otomatis setiap 5 detik.</footer>
      </main>
    </div>
  )
}
