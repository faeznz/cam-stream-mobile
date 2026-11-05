import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { once } from 'node:events'

const require = createRequire(new URL('../host/server/package.json', import.meta.url))
const WebSocket = require('ws')
const env = Object.fromEntries(readFileSync('.env', 'utf8').trim().split('\n').map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index), line.slice(index + 1)]
}))
const base = process.env.BASE_URL || 'https://cam.faeznz.my.id'
const headers = { Authorization: `Basic ${Buffer.from(`${env.ADMIN_USERNAME}:${env.ADMIN_PASSWORD}`).toString('base64')}` }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const deviceId = `smoke-${Date.now()}`
const sockets = []
async function connect(id) {
  const socket = new WebSocket(base.replace(/^http/, 'ws') + '/ws')
  sockets.push(socket)
  await once(socket, 'open')
  const registered = once(socket, 'message')
  socket.send(JSON.stringify({ type: 'register', deviceId: id, name: id }))
  const [raw] = await registered
  const message = JSON.parse(raw)
  assert.equal(message.type, 'registered')
  assert.ok(message.iceServers.some(server => server.urls.startsWith('turn:')))
  return socket
}
const timeout = setTimeout(() => { console.error('Smoke check timed out'); process.exit(1) }, 20000)
try {
  const html = await fetch(base)
  assert.equal(html.status, 200)
  assert.match(await html.text(), /Cam Stream Host/)
  assert.equal((await fetch(`${base}/api/devices`)).status, 401)
  assert.equal((await fetch(`${base}/api/devices`, { headers: { Authorization: 'Basic aW52YWxpZDppbnZhbGlk' } })).status, 401)
  const device = await connect(deviceId)
  const controller = await connect(`controller-${deviceId}`)
  await sleep(300)
  const response = await fetch(`${base}/api/devices`, { headers })
  assert.equal(response.status, 200)
  assert.ok((await response.json()).devices.some(device => device.deviceId === deviceId))
  const received = once(device, 'message')
  controller.send(JSON.stringify({ type: 'start-stream', targetDeviceId: deviceId }))
  assert.equal(JSON.parse((await received)[0]).type, 'start-stream')
  await Promise.all(sockets.map(async socket => { const closed = once(socket, 'close'); socket.close(); await closed }))
  await sleep(300)
  const remaining = await (await fetch(`${base}/api/devices`, { headers })).json()
  assert.ok(!remaining.devices.some(device => device.deviceId === deviceId))
  console.log('PASS: HTML, API authentication, ICE configuration, device registration, signaling relay, disconnect cleanup')
} finally {
  clearTimeout(timeout)
  sockets.forEach(socket => socket.close())
}
