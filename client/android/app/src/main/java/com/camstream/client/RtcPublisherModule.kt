package com.camstream.client

import android.content.Intent
import android.util.Log

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class RtcPublisherModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RtcPublisher"

  @ReactMethod
  fun stopForegroundService() {
    reactApplicationContext.stopService(Intent(reactApplicationContext, StreamService::class.java))
  }

  @ReactMethod
  fun startForegroundService(deviceId: String, wssUrl: String, promise: Promise) {
    val context = reactApplicationContext
    val intent = Intent(context, StreamService::class.java).apply {
      putExtra("deviceId", deviceId)
      putExtra("wssUrl", wssUrl)
    }
    try {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("START_FOREGROUND_SERVICE", error)
    }
    Log.d("RtcPublisher", "Started foreground service for $deviceId")
  }
}
