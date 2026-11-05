package com.camstream.client

import android.app.*
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    if (!context.getSharedPreferences("cam_stream", 0).getBoolean("enabled", false)) return
    if (Build.VERSION.SDK_INT < 34) {
      try {
        val service = Intent(context, StreamService::class.java)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service) else context.startService(service)
        return
      } catch (_: Exception) { }
    }
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(StreamService.CHANNEL, "Koneksi kamera", NotificationManager.IMPORTANCE_DEFAULT))
    val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, StreamService.CHANNEL) else Notification.Builder(context)
    manager.notify(2, builder.setContentTitle("Lanjutkan Cam Stream")
      .setContentText("Buka aplikasi untuk mengaktifkan kembali kamera setelah restart HP.")
      .setSmallIcon(android.R.drawable.presence_video_online).setContentIntent(open).setAutoCancel(true).build())
  }
}
