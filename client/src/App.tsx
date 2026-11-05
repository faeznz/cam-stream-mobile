import React, { useEffect, useState } from 'react'
import {
  AppState, KeyboardAvoidingView, Linking, NativeModules, PermissionsAndroid,
  Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native'

type ServiceState = {
  deviceId: string; name: string; url: string; enabled: boolean; status: string; error: string; batteryExempt: boolean
}
const service = NativeModules.RtcPublisher as {
  getState(): Promise<ServiceState>
  connect(name: string, url: string): Promise<void>
  disconnect(): Promise<void>
  requestBackgroundPermission(): Promise<void>
}
const labels: Record<string, string> = {
  stopped: 'Kamera belum aktif', connecting: 'Menghubungkan kamera', online: 'Siap menerima stream',
  streaming: 'Sedang menyiarkan', reconnecting: 'Menyambungkan kembali', error: 'Perlu diperiksa',
}

export default function App() {
  const [state, setState] = useState<ServiceState | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('wss://cam.faeznz.my.id/ws')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let disposed = false
    async function refresh(initial = false) {
      try {
        const snapshot = await service.getState()
        if (disposed) return
        if (initial && snapshot.enabled && snapshot.status === 'stopped') {
          const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)
            && await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
          if (granted) { await service.connect(snapshot.name, snapshot.url); snapshot.status = 'connecting' }
          else { await service.disconnect(); snapshot.enabled = false; setError('Aktifkan kamera lagi untuk memberikan izin yang diperlukan.') }
        }
        setState(snapshot)
        if (initial) { setName(snapshot.name); setUrl(snapshot.url) }
      } catch { if (!disposed) setError('Status layanan belum dapat dibaca. Buka ulang aplikasi.') }
    }
    void refresh(true)
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh() }, 1500)
    const listener = AppState.addEventListener('change', next => { if (next === 'active') void refresh() })
    return () => { disposed = true; clearInterval(timer); listener.remove() }
  }, [])

  async function activate() {
    setError('')
    if (!name.trim()) { setError('Isi nama HP agar mudah dikenali di dashboard.'); return }
    if (!/^wss?:\/\/[^/\s]+(?:\/\S*)?$/.test(url.trim())) { setError('Gunakan alamat ws:// atau wss:// yang valid.'); return }
    setBusy(true)
    try {
      if (Platform.OS === 'android') {
        const permissions = [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
        const results = await PermissionsAndroid.requestMultiple(permissions)
        if (permissions.some(permission => results[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
          setError('Izinkan kamera dan mikrofon untuk menjalankan layanan. Jika diblokir, ubah izin melalui Pengaturan aplikasi.')
          return
        }
        if (Number(Platform.Version) >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
      }
      await service.connect(name.trim(), url.trim())
      setState(await service.getState())
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Layanan belum dapat diaktifkan.') }
    finally { setBusy(false) }
  }

  async function disconnect() {
    setBusy(true)
    try { await service.disconnect(); setState(await service.getState()); setError('') }
    catch { setError('Layanan belum dapat dihentikan. Coba lagi.') }
    finally { setBusy(false) }
  }

  async function allowBackground() {
    try { await service.requestBackgroundPermission() }
    catch { setError('Pengaturan baterai tidak dapat dibuka. Pilih penggunaan baterai tanpa batas melalui Pengaturan aplikasi.') }
  }

  const enabled = state?.enabled || false
  const streaming = state?.status === 'streaming'
  const online = streaming || state?.status === 'online'
  const dashboardUrl = url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/ws\/?$/, '')
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f6f9" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}><Text style={styles.brand}>Cam<Text style={styles.brandAccent}>Stream</Text></Text><Text style={styles.version}>KAMERA ANDROID · 1.1</Text></View>
          <Text style={styles.title}>HP Anda, kamera Anda.</Text>
          <Text style={styles.description}>Hubungkan sekali. Nyalakan dan hentikan video dari dashboard.</Text>

          <View style={[styles.statusCard, online && styles.statusOnline]} accessibilityLiveRegion="polite">
            <Text style={styles.statusLabel}>STATUS KAMERA</Text>
            <Text style={styles.statusTitle}>{state ? labels[state.status] || 'Menyiapkan layanan' : 'Memuat pengaturan…'}</Text>
            <Text style={styles.statusText}>{streaming ? 'Video dan audio sedang dikirim. Indikator kamera/mikrofon dan notifikasi tetap aktif.' : online ? 'HP sudah terdaftar. Tekan Nyalakan pada kamera ini di dashboard.' : enabled ? 'Layanan akan mencoba menghubungkan ulang secara otomatis saat jaringan tersedia.' : 'Aktifkan layanan untuk menambahkan HP ini ke daftar kamera.'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Identitas & koneksi</Text>
            <Text style={styles.label} nativeID="name-label">Nama HP</Text>
            <TextInput style={[styles.input, enabled && styles.inputLocked]} accessibilityLabel="Nama HP" accessibilityLabelledBy="name-label" placeholder="Nama atau lokasi kamera" placeholderTextColor="#64748b" value={name} onChangeText={setName} editable={!enabled && !busy} maxLength={80} autoCorrect={false} returnKeyType="next" />
            <Text style={styles.label}>Alamat server</Text>
            <TextInput style={[styles.input, enabled && styles.inputLocked]} accessibilityLabel="Alamat server" value={url} onChangeText={setUrl} editable={!enabled && !busy} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholderTextColor="#64748b" />
            <Text style={styles.helper}>{enabled ? 'Putuskan koneksi terlebih dahulu untuk mengubah nama atau server.' : 'Gunakan alamat yang sama untuk semua HP. Setiap HP memiliki ID sendiri.'}</Text>
            {!!(error || state?.error) && <Text style={styles.error} accessibilityRole="alert">{error || state?.error}</Text>}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !state }} disabled={busy || !state} onPress={enabled ? disconnect : activate} style={({ pressed }) => [styles.primary, enabled && styles.disconnect, pressed && styles.pressed, (busy || !state) && styles.disabled]}><Text style={[styles.primaryText, enabled && styles.disconnectText, (busy || !state) && styles.disabledText]}>{busy ? 'Mohon tunggu…' : enabled ? 'Putuskan koneksi' : 'Aktifkan kamera'}</Text></Pressable>
            {!!error && <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.linkButton}><Text style={styles.linkText}>Buka pengaturan aplikasi</Text></Pressable>}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tetap aktif di background</Text>
            <Text style={styles.body}>Koneksi dan streaming dijalankan oleh layanan Android, terpisah dari layar aplikasi. Anda boleh pindah aplikasi atau menyapu aplikasi dari recent apps.</Text>
            <View style={styles.batteryRow}><Text style={styles.batteryTitle}>Penggunaan baterai</Text><Text style={styles.batteryValue}>{state?.batteryExempt ? 'Tanpa pembatasan' : 'Masih dioptimalkan'}</Text></View>
            {!state?.batteryExempt && <Pressable accessibilityRole="button" onPress={allowBackground} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>Izinkan berjalan di background</Text></Pressable>}
            <Text style={styles.helper}>Notifikasi layanan menunjukkan kapan koneksi aktif. Beberapa merek HP juga memerlukan izin auto-start. Paksa berhenti dari Settings tetap menghentikan layanan sampai aplikasi dibuka lagi.</Text>
          </View>

          <Pressable accessibilityRole="link" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} onPress={() => Linking.openURL(dashboardUrl).catch(() => setError('Dashboard tidak dapat dibuka. Periksa alamat server.'))}><Text style={styles.secondaryText}>Buka dashboard kamera</Text></Pressable>
          {!!state?.deviceId && <Text selectable style={styles.deviceId}>ID HP: {state.deviceId}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6f9' }, flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { paddingTop: 10, marginBottom: 30 }, brand: { color: '#172033', fontSize: 26, fontWeight: '800', letterSpacing: -1 }, brandAccent: { color: '#1d4ed8' }, version: { color: '#526078', fontSize: 12, marginTop: 8 },
  title: { color: '#172033', fontSize: 30, lineHeight: 38, fontWeight: '700', letterSpacing: -.6 }, description: { color: '#526078', fontSize: 17, lineHeight: 26, marginTop: 10, marginBottom: 24 },
  statusCard: { backgroundColor: '#e9efff', borderColor: '#9aafe7', borderWidth: 1, padding: 20, borderRadius: 12, marginBottom: 20 }, statusOnline: { backgroundColor: '#edf8f1', borderColor: '#86b99a' }, statusLabel: { color: '#27344a', fontSize: 12, fontWeight: '700', marginBottom: 10 }, statusTitle: { color: '#172033', fontSize: 23, fontWeight: '700', lineHeight: 30 }, statusText: { color: '#35435a', fontSize: 16, lineHeight: 24, marginTop: 10 },
  card: { backgroundColor: '#ffffff', borderColor: '#d7dfea', borderWidth: 1, padding: 20, borderRadius: 12, marginBottom: 20 }, sectionTitle: { color: '#172033', fontSize: 20, fontWeight: '700', marginBottom: 18 },
  label: { color: '#27344a', fontSize: 16, fontWeight: '600', marginBottom: 8 }, input: { color: '#172033', fontSize: 17, minHeight: 54, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#8490a3', borderRadius: 8, marginBottom: 18, backgroundColor: '#fff' }, inputLocked: { backgroundColor: '#f4f6f9' },
  helper: { color: '#526078', fontSize: 14, lineHeight: 22, marginBottom: 8 }, body: { color: '#35435a', fontSize: 16, lineHeight: 25 },
  primary: { minHeight: 54, backgroundColor: '#1d4ed8', padding: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14 }, primaryText: { color: '#ffffff', fontSize: 17, fontWeight: '700', textAlign: 'center' }, disconnect: { backgroundColor: '#fff1f2', borderColor: '#be4961', borderWidth: 1 }, disconnectText: { color: '#9f1239' },
  secondary: { minHeight: 50, paddingVertical: 14, paddingHorizontal: 16, borderColor: '#8490a3', borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', marginVertical: 10 }, secondaryText: { color: '#27344a', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  batteryRow: { marginTop: 18, marginBottom: 6 }, batteryTitle: { color: '#526078', fontSize: 14 }, batteryValue: { color: '#172033', fontSize: 17, fontWeight: '600', marginTop: 5 },
  error: { color: '#9f1239', fontSize: 15, lineHeight: 23, marginVertical: 12 }, linkButton: { minHeight: 48, justifyContent: 'center', marginTop: 8 }, linkText: { color: '#1d4ed8', textAlign: 'center', fontSize: 15, fontWeight: '600' }, deviceId: { color: '#526078', fontSize: 12, lineHeight: 20, textAlign: 'center', marginTop: 14 }, pressed: { opacity: .75 }, disabled: { backgroundColor: '#e4e9f0' }, disabledText: { color: '#526078' },
})
