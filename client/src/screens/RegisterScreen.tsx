import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native'

export default function RegisterScreen({ navigation, wsRef }: any) {
  const [deviceName, setDeviceName] = useState('')
  const [wssUrl, setWssUrl] = useState('wss://cam.faeznz.my.id/ws')
  const iceServers = useRef<any[]>([])
  const deviceId = useRef('device-' + Math.random().toString(36).slice(2, 10)).current

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  const handleRegister = () => {
    if (!deviceName.trim()) {
      Alert.alert('Error', 'Please enter a device name')
      return
    }
    const url = wssUrl.trim()
    if (!/^wss?:\/\/[^/\s]+(?:\/\S*)?$/.test(url)) {
      Alert.alert('Error', 'Please enter a valid ws:// or wss:// URL')
      return
    }
    wsRef.current?.close()
    const ws = new WebSocket(url)
    wsRef.current = ws
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
    }, 30000)
    ws.onclose = () => clearInterval(heartbeat)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'register', deviceId, name: deviceName.trim() }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'registered') iceServers.current = msg.iceServers
        if (msg.type === 'start-stream' && msg.targetDeviceId) {
          navigation.navigate('Stream', { deviceId, wssUrl: url, iceServers: iceServers.current })
        }
      } catch (error) {
        console.error('Invalid signaling message', error)
      }
    }

    ws.onerror = (event) => {
      if (wsRef.current === ws) {
        Alert.alert('Connection failed', event.message || 'Unable to connect to the signaling server')
      }
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cam Stream Client</Text>
      <Text style={styles.subtitle}>Register and wait for host</Text>

      <TextInput
        style={styles.input}
        placeholder="Device name"
        value={deviceName}
        onChangeText={setDeviceName}
      />
      <TextInput
        style={styles.input}
        placeholder="WSS URL"
        value={wssUrl}
        onChangeText={setWssUrl}
      />
      <Button title="Register" onPress={handleRegister} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { textAlign: 'center', color: '#666', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
})
