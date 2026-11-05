import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
import { WebSocket, WebSocketServer } from 'ws'
import Redis from 'ioredis'
import { createServer } from 'node:http'

const app = new Hono()

const PORT = Number(process.env.PORT) || 3000
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379'
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
const TURN_URL = process.env.TURN_URL || 'turn:cam.faeznz.my.id:3478'
const TURN_USERNAME = process.env.TURN_USERNAME || 'turnuser'
const TURN_PASSWORD = process.env.TURN_PASSWORD || 'turnpass123'

const redis = new Redis(REDIS_URL)
redis.on('error', console.error)
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: TURN_URL, username: TURN_USERNAME, credential: TURN_PASSWORD },
]

interface Device {
  deviceId: string
  name: string
  registeredAt: number
}

// --- Basic Auth Middleware ---
app.use('/api/*', async (c, next) => {
  const auth = c.req.header('authorization')
  if (!auth?.startsWith('Basic ')) {
    c.header('WWW-Authenticate', 'Basic realm="host"')
    return c.body('Unauthorized', 401)
  }
  const creds = Buffer.from(auth.slice(6), 'base64').toString('utf-8')
  const [username, password] = creds.split(':')
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return c.body('Unauthorized', 401)
  }
  await next()
})

// --- Routes ---
app.get('/', (c) => c.json({ status: 'ok', service: 'host-server' }))
app.get('/health', async (c) => {
  await redis.ping()
  return c.json({ status: 'ok' })
})

app.get('/api/devices', async (c) => {
  const keys = await redis.keys('device:*')
  const devices: Device[] = []
  for (const key of keys) {
    const raw = await redis.get(key)
    if (raw) {
      devices.push(JSON.parse(raw) as Device)
    }
  }
  return c.json({ devices: devices.sort((a, b) => a.registeredAt - b.registeredAt || a.deviceId.localeCompare(b.deviceId)) })
})

app.delete('/api/devices/:id', async (c) => {
  const id = c.req.param('id')
  await redis.del(`device:${id}`)
  return c.json({ ok: true })
})

app.get('/api/turn', (c) => {
  return c.json({
    url: TURN_URL,
    username: TURN_USERNAME,
    password: TURN_PASSWORD,
  })
})

// --- WebSocket Signaling ---
const httpServer = createServer(getRequestListener(app.fetch))
httpServer.listen(PORT)
const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

type Client = {
  ws: WebSocket
  deviceId?: string
}

const clients = new Map<string, Client>()
const viewers = new Map<string, string>()
const alive = new WeakSet<WebSocket>()
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) { ws.terminate(); continue }
    alive.delete(ws)
    ws.ping()
  }
}, 30000)
wss.on('close', () => clearInterval(heartbeat))

function relay(targetDeviceId: string, payload: unknown) {
  const target = clients.get(targetDeviceId)
  if (target && target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(JSON.stringify(payload))
  }
}

wss.on('connection', (ws) => {
  let currentDeviceId: string | null = null
  let isViewer = false
  alive.add(ws)
  ws.on('pong', () => {
    alive.add(ws)
    if (currentDeviceId && !isViewer) void redis.expire(`device:${currentDeviceId}`, 120)
  })

  ws.on('message', (raw) => {
    let data: any
    try {
      data = JSON.parse(raw.toString())
    } catch {
      return
    }

    switch (data.type) {
      case 'register': {
        if (typeof data.deviceId !== 'string' || !data.deviceId || data.deviceId.length > 150) return
        currentDeviceId = data.deviceId
        isViewer = data.role === 'viewer' || data.deviceId === 'host-frontend'
        clients.set(data.deviceId, { ws, deviceId: data.deviceId })
        ws.send(JSON.stringify({ type: 'registered', iceServers }))
        if (isViewer) break

        const device: Device = {
          deviceId: data.deviceId,
          name: data.name || data.deviceId,
          registeredAt: Date.now(),
        }
        void redis.set(`device:${data.deviceId}`, JSON.stringify(device), 'EX', 120)
        break
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        if (data.targetDeviceId) {
          const target = data.targetDeviceId === 'host-frontend' && currentDeviceId
            ? viewers.get(currentDeviceId) || data.targetDeviceId
            : data.targetDeviceId
          relay(target, {
            type: data.type,
            sourceDeviceId: currentDeviceId,
            ...(data.type === 'ice-candidate' ? { candidate: data.candidate } : { sdp: data.sdp }),
          })
        }
        break
      }

      case 'start-stream':
      case 'stop-stream': {
        if (data.targetDeviceId && currentDeviceId) {
          if (data.type === 'start-stream') viewers.set(data.targetDeviceId, currentDeviceId)
          else {
            if (viewers.get(data.targetDeviceId) !== currentDeviceId) break
            viewers.delete(data.targetDeviceId)
          }
          relay(data.targetDeviceId, {
            type: data.type,
            sourceDeviceId: currentDeviceId,
            targetDeviceId: data.targetDeviceId,
          })
        }
        break
      }

      case 'ping':
        if (currentDeviceId && !isViewer) void redis.expire(`device:${currentDeviceId}`, 120)
        ws.send(JSON.stringify({ type: 'pong' }))
        break

      default:
        break
    }
  })

  ws.on('close', () => {
    if (currentDeviceId) {
      if (clients.get(currentDeviceId)?.ws !== ws) return
      clients.delete(currentDeviceId)
      viewers.delete(currentDeviceId)
      for (const [deviceId, viewerId] of viewers) {
        if (viewerId === currentDeviceId) {
          relay(deviceId, { type: 'stop-stream', sourceDeviceId: currentDeviceId, targetDeviceId: deviceId })
          viewers.delete(deviceId)
        }
      }
      void redis.del(`device:${currentDeviceId}`)
    }
  })

  ws.on('error', () => ws.close())
})

console.log(`host-server listening on :${PORT}`)
