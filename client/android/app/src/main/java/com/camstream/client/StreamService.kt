package com.camstream.client

import android.app.*
import android.content.Intent
import android.os.*
import android.util.Log
import okhttp3.*
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.*
import org.webrtc.audio.JavaAudioDeviceModule
import java.util.concurrent.TimeUnit

class StreamService : Service() {
  companion object {
    const val CHANNEL = "cam_stream_service"
    const val STOP = "com.camstream.client.STOP"
    @Volatile var status = "stopped"
    @Volatile var error = ""
  }

  private val handler = Handler(Looper.getMainLooper())
  private val prefs by lazy { getSharedPreferences("cam_stream", MODE_PRIVATE) }
  private val http = OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).build()
  private var socket: WebSocket? = null
  private var stopped = false
  private var generation = 0
  private var retryDelay = 1000L
  private var wakeLock: PowerManager.WakeLock? = null
  private var iceServers = listOf<PeerConnection.IceServer>()
  private var peer: PeerConnection? = null
  private var viewer = "host-frontend"
  private var egl: EglBase? = null
  private var factory: PeerConnectionFactory? = null
  private var audioDevice: JavaAudioDeviceModule? = null
  private var capturer: CameraVideoCapturer? = null
  private var texture: SurfaceTextureHelper? = null
  private var videoSource: VideoSource? = null
  private var audioSource: AudioSource? = null
  private var videoTrack: VideoTrack? = null
  private var audioTrack: AudioTrack? = null
  private val candidates = mutableListOf<IceCandidate>()
  private var remoteReady = false
  private val reconnect = Runnable { connect() }

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, "Koneksi kamera", NotificationManager.IMPORTANCE_LOW)
      )
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) {
      prefs.edit().putBoolean("enabled", false).apply()
      stopped = true
      stopSelf()
      return START_NOT_STICKY
    }
    if (!prefs.getBoolean("enabled", false)) { stopSelf(); return START_NOT_STICKY }
    stopped = false
    try {
      startForeground(1, notification("Menyiapkan koneksi kamera…"))
      if (wakeLock == null) {
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
          .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "cam-client:connection").apply { acquire() }
      }
      if (socket == null) connect()
    } catch (failure: Exception) {
      update("error", "Tidak dapat menjalankan layanan: ${failure.message}")
      stopped = true
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  private fun notification(text: String): Notification {
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), flags)
    val stop = PendingIntent.getService(this, 1, Intent(this, StreamService::class.java).setAction(STOP), flags)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    return builder.setContentTitle(prefs.getString("name", "Cam Stream"))
      .setContentText(text).setSmallIcon(android.R.drawable.presence_video_online)
      .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
      .addAction(Notification.Action.Builder(null, "Putuskan", stop).build()).build()
  }

  private fun update(value: String, message: String = "") {
    status = value
    error = message
    val text = when (value) {
      "online" -> "Terhubung. Menunggu perintah dari dashboard."
      "streaming" -> "Kamera sedang mengirim video dan audio."
      "reconnecting" -> "Koneksi terputus. Menyambungkan kembali…"
      "error" -> message
      else -> "Menghubungkan ke dashboard…"
    }
    if (!stopped) getSystemService(NotificationManager::class.java).notify(1, notification(text))
  }

  private fun connect() {
    if (stopped || !prefs.getBoolean("enabled", false)) return
    handler.removeCallbacks(reconnect)
    update(if (retryDelay > 1000) "reconnecting" else "connecting")
    val url = prefs.getString("url", null) ?: return
    try {
      socket = http.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) { handler.post {
          if (stopped || socket !== webSocket) { webSocket.cancel(); return@post }
          webSocket.send(JSONObject().put("type", "register")
            .put("deviceId", prefs.getString("deviceId", ""))
            .put("name", prefs.getString("name", "HP Android")).toString())
        } }
        override fun onMessage(webSocket: WebSocket, text: String) { handler.post {
          if (socket !== webSocket || stopped) return@post
          try { handleMessage(JSONObject(text)) }
          catch (failure: Exception) { Log.e("CamStream", "Signaling failed", failure); stopStreaming(); update("error", "Video gagal terhubung. Nyalakan ulang dari dashboard.") }
        } }
        override fun onFailure(webSocket: WebSocket, failure: Throwable, response: Response?) { handler.post { disconnected(webSocket) } }
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { handler.post { disconnected(webSocket) } }
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, reason) }
      })
    } catch (failure: Exception) {
      update("error", "Alamat koneksi tidak valid.")
      stopped = true
      prefs.edit().putBoolean("enabled", false).apply()
      stopSelf()
    }
  }

  private fun disconnected(webSocket: WebSocket) {
    if (socket !== webSocket || stopped) return
    socket = null
    stopStreaming()
    update("reconnecting")
    handler.removeCallbacks(reconnect)
    handler.postDelayed(reconnect, retryDelay)
    retryDelay = (retryDelay * 2).coerceAtMost(30000)
  }

  private fun handleMessage(message: JSONObject) {
    when (message.optString("type")) {
      "registered" -> {
        val servers = message.optJSONArray("iceServers") ?: JSONArray()
        iceServers = (0 until servers.length()).map { index ->
          val server = servers.getJSONObject(index)
          PeerConnection.IceServer.builder(server.getString("urls"))
            .setUsername(server.optString("username")).setPassword(server.optString("credential")).createIceServer()
        }
        retryDelay = 1000
        Log.i("CamStream", "Device registered")
        update("online")
      }
      "start-stream" -> startStreaming(message.optString("sourceDeviceId", "host-frontend"))
      "stop-stream" -> {
        if (message.optString("sourceDeviceId", viewer) == viewer) { stopStreaming(); update("online") }
      }
      "answer" -> {
        val connection = peer ?: return
        connection.setRemoteDescription(object : SdpAdapter() {
          override fun onSetSuccess() { handler.post {
            if (peer !== connection) return@post
            remoteReady = true
            candidates.forEach { connection.addIceCandidate(it) }
            candidates.clear()
          } }
          override fun onSetFailure(reason: String) { streamingError(connection, reason) }
        }, SessionDescription(SessionDescription.Type.ANSWER, message.getString("sdp")))
      }
      "ice-candidate" -> {
        if (peer == null) return
        val raw = message.getJSONObject("candidate")
        val candidate = IceCandidate(raw.optString("sdpMid"), raw.optInt("sdpMLineIndex"), raw.getString("candidate"))
        if (remoteReady) peer?.addIceCandidate(candidate) else candidates.add(candidate)
      }
    }
  }

  private fun startStreaming(viewerId: String) {
    stopStreaming()
    viewer = viewerId
    val session = generation
    Log.i("CamStream", "Starting native stream session $session")
    try {
      if (factory == null) {
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(this).createInitializationOptions())
        egl = EglBase.create()
        audioDevice = JavaAudioDeviceModule.builder(this).createAudioDeviceModule()
        factory = PeerConnectionFactory.builder().setAudioDeviceModule(audioDevice)
          .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl!!.eglBaseContext, true, true))
          .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl!!.eglBaseContext)).createPeerConnectionFactory()
      }
      val config = PeerConnection.RTCConfiguration(iceServers).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }
      val connection = factory!!.createPeerConnection(config, object : PeerConnection.Observer {
        override fun onIceCandidate(candidate: IceCandidate) { handler.post {
          if (session != generation || stopped) return@post
          send(JSONObject().put("type", "ice-candidate").put("targetDeviceId", viewer)
            .put("candidate", JSONObject().put("candidate", candidate.sdp).put("sdpMid", candidate.sdpMid).put("sdpMLineIndex", candidate.sdpMLineIndex)))
        } }
        override fun onConnectionChange(state: PeerConnection.PeerConnectionState) { handler.post {
          if (session != generation || stopped) return@post
          Log.i("CamStream", "Stream $session connection: $state")
          if (state == PeerConnection.PeerConnectionState.CONNECTED) update("streaming")
          else if (state == PeerConnection.PeerConnectionState.FAILED) { stopStreaming(); update("error", "Stream terputus. Nyalakan ulang dari dashboard.") }
        } }
        override fun onSignalingChange(state: PeerConnection.SignalingState) {}
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {}
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
        override fun onAddStream(stream: MediaStream) {}
        override fun onRemoveStream(stream: MediaStream) {}
        override fun onDataChannel(channel: DataChannel) {}
        override fun onRenegotiationNeeded() {}
        override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {}
      }) ?: throw IllegalStateException("Peer connection unavailable")
      peer = connection
      val enumerator = Camera2Enumerator(this)
      val camera = enumerator.deviceNames.firstOrNull { enumerator.isBackFacing(it) } ?: enumerator.deviceNames.first()
      capturer = enumerator.createCapturer(camera, null) ?: throw IllegalStateException("Camera unavailable")
      videoSource = factory!!.createVideoSource(false)
      texture = SurfaceTextureHelper.create("CamStreamCapture", egl!!.eglBaseContext)
      capturer!!.initialize(texture, this, videoSource!!.capturerObserver)
      capturer!!.startCapture(1280, 720, 20)
      videoTrack = factory!!.createVideoTrack("camera-video", videoSource)
      audioSource = factory!!.createAudioSource(MediaConstraints())
      audioTrack = factory!!.createAudioTrack("camera-audio", audioSource)
      connection.addTrack(videoTrack, listOf("camera"))
      connection.addTrack(audioTrack, listOf("camera"))
      connection.createOffer(object : SdpAdapter() {
        override fun onCreateSuccess(description: SessionDescription) {
          handler.post {
          if (peer !== connection || session != generation || stopped) return@post
          connection.setLocalDescription(object : SdpAdapter() {
            override fun onSetSuccess() { handler.post {
              if (peer === connection) send(JSONObject().put("type", "offer").put("targetDeviceId", viewer).put("sdp", description.description))
            } }
            override fun onSetFailure(reason: String) { streamingError(connection, reason) }
          }, description)
          }
        }
        override fun onCreateFailure(reason: String) { streamingError(connection, reason) }
      }, MediaConstraints())
      update("connecting")
    } catch (failure: Exception) {
      Log.e("CamStream", "Camera start failed", failure)
      stopStreaming()
      update("error", "Kamera tidak dapat dimulai. Buka aplikasi dan periksa izin kamera/mikrofon.")
    }
  }

  private fun streamingError(connection: PeerConnection, reason: String) { handler.post {
    if (peer !== connection) return@post
    Log.e("CamStream", "SDP failed: $reason")
    stopStreaming()
    update("error", "Negosiasi video gagal. Coba nyalakan ulang dari dashboard.")
  } }

  private fun send(message: JSONObject) { socket?.send(message.toString()) }

  private fun stopStreaming() {
    generation++
    val connection = peer
    peer = null
    connection?.close()
    connection?.dispose()
    try { capturer?.stopCapture() } catch (failure: Exception) { Log.w("CamStream", "Capture stop", failure) }
    capturer?.dispose(); capturer = null
    videoTrack?.dispose(); videoTrack = null
    audioTrack?.dispose(); audioTrack = null
    videoSource?.dispose(); videoSource = null
    audioSource?.dispose(); audioSource = null
    texture?.dispose(); texture = null
    candidates.clear()
    remoteReady = false
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    stopped = true
    handler.removeCallbacksAndMessages(null)
    socket?.cancel(); socket = null
    stopStreaming()
    factory?.dispose(); factory = null
    audioDevice?.release(); audioDevice = null
    egl?.release(); egl = null
    http.dispatcher.executorService.shutdown()
    http.connectionPool.evictAll()
    wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null
    status = if (prefs.getBoolean("enabled", false)) "reconnecting" else "stopped"
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private open class SdpAdapter : SdpObserver {
    override fun onCreateSuccess(description: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(reason: String) {}
    override fun onSetFailure(reason: String) {}
  }
}
