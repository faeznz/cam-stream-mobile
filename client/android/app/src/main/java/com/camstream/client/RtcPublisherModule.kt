package com.camstream.client

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.*
import java.util.UUID

class RtcPublisherModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val prefs get() = context.getSharedPreferences("cam_stream", 0)
  override fun getName() = "RtcPublisher"

  @ReactMethod
  fun getState(promise: Promise) {
    if (!prefs.contains("deviceId")) prefs.edit().putString("deviceId", "device-${UUID.randomUUID()}").apply()
    val power = context.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
    promise.resolve(Arguments.createMap().apply {
      putString("deviceId", prefs.getString("deviceId", ""))
      putString("name", prefs.getString("name", Build.MODEL))
      putString("url", prefs.getString("url", "wss://cam.faeznz.my.id/ws"))
      putBoolean("enabled", prefs.getBoolean("enabled", false))
      putString("status", StreamService.status)
      putString("error", StreamService.error)
      putBoolean("batteryExempt", power.isIgnoringBatteryOptimizations(context.packageName))
    })
  }

  @ReactMethod
  fun connect(name: String, url: String, promise: Promise) {
    val parsed = Uri.parse(url)
    if (name.isBlank() || name.length > 80 || parsed.scheme !in listOf("wss", "ws") || parsed.host.isNullOrBlank()) {
      promise.reject("INVALID_CONFIG", "Nama HP atau alamat koneksi tidak valid."); return
    }
    val unchanged = prefs.getString("name", "") == name && prefs.getString("url", "") == url
    if (!unchanged) context.stopService(Intent(context, StreamService::class.java))
    if (!prefs.contains("deviceId")) prefs.edit().putString("deviceId", "device-${UUID.randomUUID()}").apply()
    prefs.edit().putString("name", name).putString("url", url).putBoolean("enabled", true).apply()
    try {
      val intent = Intent(context, StreamService::class.java)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      promise.resolve(null)
    } catch (failure: Exception) {
      prefs.edit().putBoolean("enabled", false).apply()
      promise.reject("SERVICE_START", "Buka aplikasi untuk mengaktifkan koneksi kamera.", failure)
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    prefs.edit().putBoolean("enabled", false).apply()
    context.stopService(Intent(context, StreamService::class.java))
    StreamService.status = "stopped"
    StreamService.error = ""
    promise.resolve(null)
  }

  @ReactMethod
  fun requestBackgroundPermission(promise: Promise) {
    try {
      context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (failure: Exception) { promise.reject("BACKGROUND_SETTINGS", "Pengaturan baterai tidak dapat dibuka.", failure) }
  }
}
