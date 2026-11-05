package com.camstream.client

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.PowerManager

class StreamService : Service() {

  private val CHANNEL_ID = "cam_stream_service"
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
    val notification = builder
      .setContentTitle("Cam Stream Client")
      .setContentText("Streaming in background")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setOngoing(true)
      .build()
    startForeground(1, notification)
    if (wakeLock == null) {
      val powerManager = getSystemService(POWER_SERVICE) as PowerManager
      wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "cam-client:stream").apply {
        acquire()
      }
    }
    return Service.START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    super.onDestroy()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Cam Stream",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Foreground service for camera streaming"
      }
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(channel)
    }
  }
}
