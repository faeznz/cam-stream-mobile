package com.camstream.client

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  override fun getMainComponentName(): String = "cam-client"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    object : DefaultReactActivityDelegate(this, mainComponentName, false) {
      override fun getLaunchOptions(): Bundle = Bundle().apply {
        putString("wssUrl", "wss://api.cam.faeznz.my.id/ws")
      }
    }
}
