# Android client

Requires Node 18+, Java 17, Android SDK platform 34 and build-tools 34.0.0.
The app supports Android 7.0/API 24 and later. Accept Android SDK licenses
with `sdkmanager --licenses` so Gradle can install additional native tooling
when requested.

Set `ANDROID_HOME` to your SDK directory and add `$ANDROID_HOME/platform-tools`
to `PATH`. Set `sdk.dir` in `android/local.properties` for your machine.

```sh
npm ci
npm run typecheck
npm start
```

In another terminal, connect and authorize a USB-debugging device:

```sh
adb devices -l
npx react-native run-android --deviceId <device-id> --no-packager
```

To build an APK without a connected device:

```sh
cd android
./gradlew :app:assembleDebug
```

The APK is `android/app/build/outputs/apk/debug/app-debug.apk`.
Debug builds load JavaScript from Metro over `adb reverse tcp:8081 tcp:8081`.

## Standalone APK

```sh
cd android
./gradlew :app:assembleRelease
```

Install `android/app/build/outputs/apk/release/app-release.apk` directly on the
phone. It includes the JavaScript bundle and runs without Metro. This local
sideload build uses the development signing key, matching the debug installation.
Signaling and TURN still need to be reachable over the network for streaming.

Enter the signaling WebSocket URL and register a device name. Keep the app
visible when the host first starts a stream so Android can grant camera and
microphone access. Streaming uses `react-native-webrtc`, with a foreground
notification and a partial wake lock released when the stream stops.
Production signaling and TURN must be reachable for remote viewing.

## Device smoke check

1. Press Register with an empty name and check that validation appears.
2. Register with a reachable signaling server, start from the host, grant
   camera/microphone access, and check that the host receives audio/video tracks.
3. Press Home, then turn the screen off. Check that received video frames keep
   increasing and the foreground notification remains present.
4. Stop from the host, reopen the app, and start again without re-registering.
   Check the new stream, then press Stop Stream on the phone. The camera,
   foreground notification, and `StreamService` should stop.

Inspect service state with `adb shell dumpsys activity services com.camstream.client`.
