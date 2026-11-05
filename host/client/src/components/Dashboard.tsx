import { useEffect, useState } from 'react'
import DeviceList from './DeviceList'

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [devices, setDevices] = useState<Array<{ deviceId: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDevices()
    const timer = setInterval(loadDevices, 5000)
    return () => clearInterval(timer)
  }, [])

  async function loadDevices() {
    const auth = localStorage.getItem('cam_auth')
    if (!auth) {
      onLogout()
      return
    }
    try {
      const res = await fetch('/api/devices', {
        headers: { Authorization: `Basic ${auth}` },
      })
      if (res.status === 401) {
        localStorage.removeItem('cam_auth')
        onLogout()
        return
      }
      if (!res.ok) throw new Error('Failed to load devices')
      const data = await res.json()
      setError('')
      setDevices(data.devices || [])
    } catch {
      setError('Failed to load devices. Retrying...')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Devices</h1>
        <button
          onClick={async () => {
            localStorage.removeItem('cam_auth')
            onLogout()
          }}
          className="text-sm text-red-600 hover:underline"
        >
          Logout
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
      {loading ? (
        <div className="text-gray-500">Loading devices...</div>
      ) : devices.length === 0 ? (
        <div className="text-gray-500 text-center py-10">No devices online</div>
      ) : (
        <DeviceList devices={devices} />
      )}
    </div>
  )
}
