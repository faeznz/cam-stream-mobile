import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Button, NativeModules, PermissionsAndroid, Platform } from 'react-native'
import {
  RTCView, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, MediaStream,
} from 'react-native-webrtc'

export default function StreamScreen({ route, navigation, wsRef }: any) {
  const { deviceId, wssUrl, iceServers } = route.params
  const ws = wsRef.current as WebSocket | null
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState('Connecting...')

  useEffect(() => {
    if (!ws) return
    const socket = ws

    let disposed = false
    let pc: RTCPeerConnection | null = null
    let stream: MediaStream | null = null
    const candidates: RTCIceCandidate[] = []
    const previousMessageHandler = socket.onmessage
    const previousCloseHandler = socket.onclose

    const cleanup = () => {
      disposed = true
      pc?.close()
      stream?.getTracks().forEach((track) => track.stop())
      NativeModules.RtcPublisher.stopForegroundService()
    }

    async function startPublishing() {
      try {
        if (Platform.OS === 'android') {
          const permissions = [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
          const granted = await PermissionsAndroid.requestMultiple(permissions)
          if (permissions.some((permission) => granted[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
            throw new Error('Camera and microphone permissions are required')
          }
          if (Number(Platform.Version) >= 33) {
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
          }
        }
        if (disposed) return
        await NativeModules.RtcPublisher.startForegroundService(deviceId, wssUrl)
        if (disposed) return
        stream = await mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true })
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        setLocalStream(stream)
        pc = new RTCPeerConnection({
          iceServers,
        })
        stream.getTracks().forEach((track) => pc!.addTrack(track, stream!))
        pc.addEventListener('icecandidate', (event: any) => {
          if (event.candidate && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ice-candidate', targetDeviceId: 'host-frontend', candidate: event.candidate }))
          }
        })
        pc.addEventListener('connectionstatechange', () => {
          if (disposed) return
          if (pc?.connectionState === 'connected') setStatus('Streaming...')
          else if (pc?.connectionState === 'failed' || pc?.connectionState === 'disconnected') {
            setStatus('Stream disconnected')
          }
        })
        const offer = await pc.createOffer({})
        if (disposed) return
        await pc.setLocalDescription(new RTCSessionDescription(offer))
        if (disposed) return
        if (socket.readyState !== WebSocket.OPEN) throw new Error('WebSocket disconnected')
        socket.send(JSON.stringify({ type: 'offer', targetDeviceId: 'host-frontend', sdp: pc.localDescription!.sdp }))
        setStatus('Waiting for host connection...')
      } catch (error) {
        if (disposed) return
        cleanup()
        setLocalStream(null)
        setStatus(error instanceof Error ? error.message : 'Failed to start publishing')
        console.error('Failed to start publishing', error)
      }
    }

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(String(event.data))
        if (msg.type === 'answer' && pc) {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }))
          for (const candidate of candidates.splice(0)) await pc.addIceCandidate(candidate)
        } else if (msg.type === 'ice-candidate') {
          const candidate = new RTCIceCandidate(msg.candidate)
          if (pc?.remoteDescription) await pc.addIceCandidate(candidate)
          else candidates.push(candidate)
        } else if (msg.type === 'stop-stream') {
          cleanup()
          navigation.goBack()
        }
      } catch (error) {
        console.error('Signaling failed', error)
        if (!disposed) setStatus('Signaling failed')
      }
    }
    socket.onclose = () => {
      cleanup()
      setLocalStream(null)
      setStatus('WebSocket disconnected')
    }
    startPublishing()

    return () => {
      cleanup()
      socket.onmessage = previousMessageHandler
      socket.onclose = previousCloseHandler
    }
  }, [ws, deviceId, wssUrl, navigation])

  return (
    <View style={styles.container}>
      {localStream && <RTCView style={styles.camera} streamURL={localStream.toURL()} objectFit="cover" />}
      <Text style={styles.status}>{status}</Text>
      <Button title="Stop Stream" onPress={() => navigation.goBack()} color="#ff0000" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { ...StyleSheet.absoluteFillObject },
  status: { position: 'absolute', bottom: 60, left: 0, right: 0, textAlign: 'center', color: '#0f0', fontWeight: 'bold', fontSize: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
})
