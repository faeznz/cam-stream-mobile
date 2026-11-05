import { useEffect, useRef, useState } from 'react'

interface Device { deviceId: string; name: string }
interface StreamState { pc: RTCPeerConnection; stream: MediaStream }
type Status = 'waiting' | 'connecting' | 'streaming' | 'error'
const statusLabels: Record<Status, string> = {
  waiting: 'Siap dihubungkan', connecting: 'Menghubungkan…', streaming: 'Live', error: 'Koneksi terputus',
}

export default function DeviceList({ devices, onAddDevice }: { devices: Device[]; onAddDevice: () => void }) {
  const [streams, setStreams] = useState<Map<string, StreamState>>(new Map())
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [connected, setConnected] = useState(false)
  const [brightness, setBrightness] = useState<Record<string, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('cam_brightness') || '{}')
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}
      return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'number' && value >= 100 && value <= 250)) as Record<string, number>
    } catch { return {} }
  })
  const [rotation, setRotation] = useState<Record<string, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('cam_rotation') || '{}')
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}
      return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'number' && [0, 90, 180, 270].includes(value))) as Record<string, number>
    } catch { return {} }
  })
  const wsRef = useRef<WebSocket | null>(null)
  const peers = useRef(new Map<string, StreamState>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const statusesRef = useRef(statuses)

  useEffect(() => {
    try { localStorage.setItem('cam_brightness', JSON.stringify(brightness)) } catch { /* Brightness still works when browser storage is unavailable. */ }
  }, [brightness])

  useEffect(() => {
    try { localStorage.setItem('cam_rotation', JSON.stringify(rotation)) } catch { /* Rotation remains available without browser storage. */ }
  }, [rotation])

  function adjustBrightness(id: string, value: number) {
    setBrightness(previous => ({ ...previous, [id]: value }))
  }

  function updateStatus(id: string, status: Status) {
    statusesRef.current = { ...statusesRef.current, [id]: status }
    setStatuses(statusesRef.current)
  }

  function closePeer(id: string) {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    const state = peers.current.get(id)
    peers.current.delete(id)
    if (state) {
      state.pc.onconnectionstatechange = null
      state.pc.close()
      state.stream.getTracks().forEach(track => track.stop())
    }
    setStreams(new Map(peers.current))
  }

  useEffect(() => {
    let disposed = false
    let retry: ReturnType<typeof setTimeout>
    let socket: WebSocket
    function connect() {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`)
      wsRef.current = socket
      let iceServers: RTCIceServer[] = []
      const candidates = new Map<string, RTCIceCandidateInit[]>()
      socket.onopen = () => socket.send(JSON.stringify({ type: 'register', deviceId: `host-frontend:${crypto.randomUUID()}`, name: 'Dashboard', role: 'viewer' }))
      socket.onmessage = async event => {
        let message: any
        try { message = JSON.parse(event.data) } catch { return }
        const id = message.sourceDeviceId
        try {
          if (message.type === 'registered') { iceServers = message.iceServers; setConnected(true) }
          else if (message.type === 'offer' && id && message.sdp) {
            if (statusesRef.current[id] !== 'connecting') return
            closePeer(id)
            const pc = new RTCPeerConnection({ iceServers })
            const stream = new MediaStream()
            peers.current.set(id, { pc, stream })
            setStreams(new Map(peers.current))
            const timeout = setTimeout(() => { stopStream(id); updateStatus(id, 'error') }, 30000)
            timers.current.set(id, timeout)
            pc.ontrack = event => stream.addTrack(event.track)
            pc.onicecandidate = event => {
              if (event.candidate && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ice-candidate', targetDeviceId: id, candidate: event.candidate }))
            }
            pc.onconnectionstatechange = () => {
              if (peers.current.get(id)?.pc !== pc) return
              if (pc.connectionState === 'connected') { clearTimeout(timers.current.get(id)); timers.current.delete(id); updateStatus(id, 'streaming') }
              else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') { stopStream(id); updateStatus(id, 'error') }
            }
            await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp })
            for (const candidate of candidates.get(id) || []) await pc.addIceCandidate(candidate)
            candidates.delete(id)
            await pc.setLocalDescription(await pc.createAnswer())
            if (socket.readyState === WebSocket.OPEN && peers.current.get(id)?.pc === pc) socket.send(JSON.stringify({ type: 'answer', targetDeviceId: id, sdp: pc.localDescription!.sdp }))
          } else if (message.type === 'ice-candidate' && id && message.candidate && statusesRef.current[id] !== 'waiting') {
            const peer = peers.current.get(id)
            if (peer?.pc.remoteDescription) await peer.pc.addIceCandidate(message.candidate)
            else if (statusesRef.current[id] === 'connecting') candidates.set(id, [...(candidates.get(id) || []), message.candidate])
          }
        } catch (error) {
          console.error('Camera signaling failed', error)
          if (id && statusesRef.current[id] !== 'waiting') { stopStream(id); updateStatus(id, 'error') }
        }
      }
      socket.onclose = () => {
        if (disposed) return
        setConnected(false)
        for (const id of Object.keys(statusesRef.current)) { closePeer(id); updateStatus(id, 'waiting') }
        retry = setTimeout(connect, 3000)
      }
      socket.onerror = () => socket.close()
    }
    connect()
    return () => {
      disposed = true
      clearTimeout(retry)
      for (const id of Object.keys(statusesRef.current)) {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'stop-stream', targetDeviceId: id }))
        closePeer(id)
      }
      socket.close()
    }
  }, [])

  useEffect(() => {
    const online = new Set(devices.map(device => device.deviceId))
    for (const id of Object.keys(statusesRef.current)) {
      if (!online.has(id)) { closePeer(id); delete statusesRef.current[id] }
    }
    setStatuses({ ...statusesRef.current })
  }, [devices])

  function startStream(id: string) {
    const socket = wsRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || ['connecting', 'streaming'].includes(statusesRef.current[id])) return
    updateStatus(id, 'connecting')
    socket.send(JSON.stringify({ type: 'start-stream', targetDeviceId: id }))
    timers.current.set(id, setTimeout(() => { stopStream(id); updateStatus(id, 'error') }, 30000))
  }

  function stopStream(id: string) {
    updateStatus(id, 'waiting')
    closePeer(id)
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'stop-stream', targetDeviceId: id }))
  }

  const active = devices.filter(device => ['connecting', 'streaming'].includes(statuses[device.deviceId]))
  const live = devices.filter(device => statuses[device.deviceId] === 'streaming').length
  return (
    <section aria-labelledby="camera-heading">
      <div className="camera-toolbar">
        <div>
          <h2 id="camera-heading">Kamera Anda <span className="device-count">{devices.length}</span></h2>
          <p className="camera-summary" role="status">{connected ? `${devices.length} HP terhubung · ${live} kamera live` : 'Menghubungkan kontrol kamera…'}</p>
        </div>
        <div className="bulk-actions">
          <button className="button button-primary" disabled={!connected || !devices.length || active.length === devices.length} onClick={() => devices.forEach(device => startStream(device.deviceId))}>Nyalakan semua</button>
          <button className="button button-secondary" disabled={!connected || !active.length} onClick={() => active.forEach(device => stopStream(device.deviceId))}>Hentikan semua</button>
        </div>
      </div>
      {!devices.length ? (
        <div className="empty-state"><div className="empty-camera" aria-hidden="true">▣</div><h3>Belum ada HP terhubung</h3><p>Pasang aplikasi di HP Anda dan daftarkan perangkat untuk mulai memantau.</p><button className="button button-primary" onClick={onAddDevice}>Hubungkan HP pertama</button></div>
      ) : (
        <div className="camera-grid">
          {devices.map((device, index) => {
            const status = statuses[device.deviceId] || 'waiting'
            const running = status === 'connecting' || status === 'streaming'
            const level = brightness[device.deviceId] || 100
            const angle = rotation[device.deviceId] || 0
            return (
              <article className="camera-card" key={device.deviceId} aria-label={`Kamera ${device.name}`}>
                <div className="camera-card-heading"><div className="camera-identity"><span className="camera-number">{String(index + 1).padStart(2, '0')}</span><h3>{device.name}</h3></div><span className={`camera-status status-${status}`}>{statusLabels[status]}</span></div>
                <div className="video-stage">
                  {streams.has(device.deviceId) && <video autoPlay playsInline muted className={angle % 180 ? 'video-quarter-turn' : undefined} style={{ filter: `brightness(${level / 100})`, transform: `translate(-50%, -50%) rotate(${angle}deg)` }} ref={video => { const stream = streams.get(device.deviceId)!.stream; if (video && video.srcObject !== stream) video.srcObject = stream }} aria-label={`Video ${device.name}`} />}
                  {status !== 'streaming' && <div className="video-placeholder"><span className="placeholder-symbol" aria-hidden="true">{status === 'connecting' ? '◌' : '▣'}</span><p>{status === 'connecting' ? 'Menunggu video dari HP…' : status === 'error' ? 'Video belum tersambung' : 'Kamera siap saat Anda butuhkan'}</p><small>{status === 'error' ? 'Pastikan layanan kamera aktif dan izin kamera diberikan.' : status === 'connecting' ? 'Layanan kamera di HP sedang menyiapkan video.' : 'Tekan Nyalakan untuk mulai menonton.'}</small></div>}
                </div>
                <div className="camera-enhance">
                  <div className="enhance-heading">
                    <label htmlFor={`brightness-${device.deviceId}`}>Kecerahan tampilan</label>
                    <output htmlFor={`brightness-${device.deviceId}`}>{level}%</output>
                  </div>
                  <div className="enhance-controls">
                    <button className="button button-secondary enhance-button" aria-label={`Terangkan ${device.name}`} aria-pressed={level > 100} onClick={() => adjustBrightness(device.deviceId, level > 100 ? 100 : 160)}>Terangkan</button>
                    <input id={`brightness-${device.deviceId}`} type="range" min="100" max="250" step="5" value={level} aria-label={`Kecerahan ${device.name}`} aria-valuetext={`${level} persen`} onChange={event => adjustBrightness(device.deviceId, Number(event.target.value))} />
                    <button className="button button-quiet" aria-label={`Reset kecerahan ${device.name}`} disabled={level === 100} onClick={() => adjustBrightness(device.deviceId, 100)}>Reset</button>
                  </div>
                  <div className="rotation-controls">
                    <span>Orientasi <output aria-label={`Orientasi ${device.name}`}>{angle}°</output></span>
                    <button className="button button-secondary" aria-label={`Putar ${device.name} 90 derajat`} onClick={() => setRotation(previous => ({ ...previous, [device.deviceId]: (angle + 90) % 360 }))}>Putar 90°</button>
                    <button className="button button-quiet" aria-label={`Reset orientasi ${device.name}`} disabled={angle === 0} onClick={() => setRotation(previous => ({ ...previous, [device.deviceId]: 0 }))}>Reset arah</button>
                  </div>
                </div>
                <div className="camera-card-footer"><span className="device-id" title={device.deviceId}>{device.deviceId}</span><button className={`button ${running ? 'button-stop' : 'button-secondary'}`} disabled={!connected} aria-label={`${running ? 'Hentikan' : 'Nyalakan'} ${device.name}`} onClick={() => running ? stopStream(device.deviceId) : startStream(device.deviceId)}>{running ? 'Hentikan' : status === 'error' ? 'Coba lagi' : 'Nyalakan'}</button></div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
