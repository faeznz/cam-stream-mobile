import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { WebSocketServer } from 'ws'
import { createClient } from 'redis'

const app = new Hono()

const PORT = Number(process.env.PORT) || 3000
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379'
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
const TURN_URL = process.env.TURN_URL || 'turn:cam.faeznz.my.id:3478'
const TURN_USERNAME = process.env.TURN_USERNAME || 'turnuser'
const TURN_PASSWORD = process.env.TURN_PASSWORD || 'turnpass123'

const redis = createClient({ url: REDIS_URL })
redis.connect().catch(console.error)

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

app.get('/api/devices', async (c) => {
  const keys = await redis.keys('device:*')
  const devices: Device[] = []
  for (const key of keys) {
    const raw = await redis.get(key)
    if (raw) {
      devices.push(JSON.parse(raw) as Device)
    }
  }
  return c.json({ devices })
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
const httpServer = serve({ fetch: app.fetch, port: PORT })
const wss = new WebSocketServer({ server: httpServer })

type Client = {
  ws: WebSocket
  deviceId?: string
}

const clients = new Map<string, Client>()

function relay(targetDeviceId: string, payload: unknown) {
  const target = clients.get(targetDeviceId)
  if (target && target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(JSON.stringify(payload))
  }
}

wss.on('connection', (ws) => {
  let currentDeviceId: string | null = null

  ws.on('message', (raw) => {
    let data: any
    try {
      data = JSON.parse(raw.toString())
    } catch {
      return
    }

    switch (data.type) {
      case 'register': {
        currentDeviceId = data.deviceId
        clients.set(data.deviceId, { ws, deviceId: data.deviceId })

        const device: Device = {
          deviceId: data.deviceId,
          name: data.name || data.deviceId,
          registeredAt: Date.now(),
        }
        void redis.set(`device:${data.deviceId}`, JSON.stringify(device))
        break
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        if (data.targetDeviceId) {
          relay(data.targetDeviceId, {
            type: data.type,
            sourceDeviceId: currentDeviceId,
            ...(data.type === 'ice-candidate' ? { candidate: data.candidate } : { sdp: data.sdp }),
          })
        }
        break
      }

      case 'start-stream':
      case 'stop-stream': {
        if (data.targetDeviceId) {
          relay(data.targetDeviceId, {
            type: data.type,
            sourceDeviceId: currentDeviceId,
            targetDeviceId: data.targetDeviceId,
          })
        }
        break
      }

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }))
        break

      default:
        break
    }
  })

  ws.on('close', () => {
    if (currentDeviceId) {
      clients.delete(currentDeviceId)
      void redis.del(`device:${currentDeviceId}`)
    }
  })

  ws.on('error', () => {
    if (currentDeviceId) {
      clients.delete(currentDeviceId)
      void redis.del(`device:${currentDeviceId}`)
    }
  })
})

console.log(`host-server listening on :${PORT}`)
