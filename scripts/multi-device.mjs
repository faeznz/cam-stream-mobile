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
const prefix = `multi-test-${Date.now()}`
const sockets = []
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function connect(id, name) {
  const socket = new WebSocket(base.replace(/^http/, 'ws') + '/ws')
  sockets.push(socket)
  await once(socket, 'open')
  const registered = once(socket, 'message')
  socket.send(JSON.stringify({ type: 'register', deviceId: id, name }))
  assert.equal(JSON.parse((await registered)[0]).type, 'registered')
  const messages = []
  socket.on('message', raw => messages.push(JSON.parse(raw)))
  return { id, socket, messages }
}
const timeout = setTimeout(() => { console.error('Multi-device test timed out'); process.exit(1) }, 20000)
try {
  const phones = await Promise.all([1, 2, 3].map(number => connect(`${prefix}-${number}`, `Test phone ${number}`)))
  const dashboard = await connect(`${prefix}-controller`, 'Test controller')
  await sleep(300)
  const devices = await (await fetch(`${base}/api/devices`, { headers })).json()
  phones.forEach(phone => assert.ok(devices.devices.some(device => device.deviceId === phone.id)))
  phones.forEach(phone => dashboard.socket.send(JSON.stringify({ type: 'start-stream', targetDeviceId: phone.id })))
  await sleep(300)
  phones.forEach(phone => {
    assert.equal(phone.messages.length, 1)
    assert.equal(phone.messages[0].type, 'start-stream')
    assert.equal(phone.messages[0].targetDeviceId, phone.id)
    phone.socket.send(JSON.stringify({ type: 'offer', targetDeviceId: dashboard.id, sdp: `test-offer-${phone.id}` }))
  })
  await sleep(300)
  assert.equal(dashboard.messages.length, 3)
  phones.forEach(phone => assert.ok(dashboard.messages.some(message => message.sourceDeviceId === phone.id && message.sdp === `test-offer-${phone.id}`)))
  dashboard.socket.send(JSON.stringify({ type: 'stop-stream', targetDeviceId: phones[0].id }))
  await sleep(300)
  assert.equal(phones[0].messages.at(-1).type, 'stop-stream')
  assert.equal(phones[1].messages.length, 1)
  assert.equal(phones[2].messages.length, 1)
  const closed = once(phones[0].socket, 'close')
  phones[0].socket.close()
  await closed
  await sleep(300)
  const remaining = await (await fetch(`${base}/api/devices`, { headers })).json()
  assert.ok(!remaining.devices.some(device => device.deviceId === phones[0].id))
  assert.ok(remaining.devices.some(device => device.deviceId === phones[1].id))
  assert.ok(remaining.devices.some(device => device.deviceId === phones[2].id))
  console.log('PASS: 3 simultaneous registrations, bulk start routing, independent offers, isolated stop, independent disconnect cleanup')
} finally {
  clearTimeout(timeout)
  sockets.forEach(socket => socket.close())
}
