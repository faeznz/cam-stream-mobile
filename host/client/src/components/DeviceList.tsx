import { useEffect, useRef, useState } from 'react'

interface Device {
  deviceId: string
  name: string
}

interface StreamState {
  pc: RTCPeerConnection
  stream: MediaStream
}

export default function DeviceList({ devices }: { devices: Device[] }) {
  const [streams, setStreams] = useState<Map<string, StreamState>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`)
    let iceServers: RTCIceServer[] = []
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
    }, 30000)
    wsRef.current = ws
    const pcMap = new Map<string, StreamState>()
    const pendingCandidates = new Map<string, RTCIceCandidateInit[]>()

    ws.onopen = () => {
      console.log('Host frontend WS connected')
      ws.send(JSON.stringify({ type: 'register', deviceId: 'host-frontend', name: 'Host Frontend' }))
    }

    ws.onmessage = async (event) => {
      let msg: any
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      switch (msg.type) {
        case 'registered':
          iceServers = msg.iceServers
          break
        case 'offer': {
          const { sourceDeviceId, sdp } = msg
          if (!sourceDeviceId || !sdp) return

          const pc = new RTCPeerConnection({ iceServers })
          const stream = new MediaStream()
          pcMap.set(sourceDeviceId, { pc, stream })
          setStreams((prev) => new Map(prev).set(sourceDeviceId, { pc, stream }))

          pc.ontrack = (event) => {
            stream.addTrack(event.track)
          }

          pc.onicecandidate = (event) => {
            if (event.candidate && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'ice-candidate',
                targetDeviceId: sourceDeviceId,
                candidate: event.candidate,
              }))
            }
          }

          pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }))
            .then(async () => {
              for (const candidate of pendingCandidates.get(sourceDeviceId) || []) await pc.addIceCandidate(candidate)
              pendingCandidates.delete(sourceDeviceId)
            })
            .then(() => pc.createAnswer())
            .then((answer) => pc.setLocalDescription(answer))
            .then(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'answer',
                  targetDeviceId: sourceDeviceId,
                  sdp: pc.localDescription!.sdp,
                }))
              }
            })
            .catch(console.error)
          break
        }

        case 'ice-candidate': {
          const { sourceDeviceId, candidate } = msg
          const state = pcMap.get(sourceDeviceId)
          if (state?.pc.remoteDescription && candidate) {
            state.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error)
          } else if (candidate) {
            pendingCandidates.set(sourceDeviceId, [...(pendingCandidates.get(sourceDeviceId) || []), candidate])
          }
          break
        }

        default:
          break
      }
    }

    return () => {
      clearInterval(heartbeat)
      ws.close()
      pcMap.forEach((state) => {
        state.pc.close()
        state.stream.getTracks().forEach((t) => t.stop())
      })
      pcMap.clear()
      setStreams(new Map())
    }
  }, [])

  function startStream(deviceId: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'start-stream',
        targetDeviceId: deviceId,
      }))
    }
  }

  function stopStream(deviceId: string) {
    const state = streams.get(deviceId)
    if (state) {
      state.pc.close()
      state.stream.getTracks().forEach((t) => t.stop())
      setStreams((prev) => {
        const next = new Map(prev)
        next.delete(deviceId)
        return next
      })
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'stop-stream',
          targetDeviceId: deviceId,
        }))
      }
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {devices.map((device) => (
        <div key={device.deviceId} className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800">{device.name}</h3>
          <p className="text-sm text-gray-500 truncate">{device.deviceId}</p>
          <div className="mt-4 bg-black rounded min-h-[200px] flex items-center justify-center relative overflow-hidden">
            {streams.has(device.deviceId) ? (
              <video
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                ref={(video) => { if (video) video.srcObject = streams.get(device.deviceId)!.stream }}
              />
            ) : (
              <span className="text-gray-400 text-sm">Waiting for stream...</span>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => startStream(device.deviceId)}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={streams.has(device.deviceId)}
            >
              {streams.has(device.deviceId) ? 'Streaming' : 'Start'}
            </button>
            <button
              onClick={() => stopStream(device.deviceId)}
              className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700"
              disabled={!streams.has(device.deviceId)}
            >
              Stop
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
