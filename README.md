# Cam Stream

Dashboard, API, and signaling share `https://cam.faeznz.my.id`:

- `/`: web dashboard
- `/api/`: authenticated API
- `/ws`: WebSocket signaling for Android and the dashboard

## Images

Pushes to `main` and manual runs of `.github/workflows/images.yml` publish
`ghcr.io/faeznz/cam-stream-server` and `ghcr.io/faeznz/cam-stream-web`.
Each image has `latest` and full commit SHA tags. The workflow builds on GitHub;
the production Compose file only pulls images.

## VPS deployment

The deployment lives at `/home/faeznz/cam-stream-mobile`. It uses the existing
Traefik `traefik-network` network and `myresolver` certificate resolver.
Copy `docker-compose.yml`, `coturn/docker-entrypoint.sh`, and a private `.env`
based on `.env.example` into that folder. Keep `.env` mode `600`.

```sh
cd /home/faeznz/cam-stream-mobile
sudo docker compose pull
sudo docker compose up -d --wait
sudo docker compose ps
```

Set `IMAGE_TAG` in `.env` to a full commit SHA to deploy a specific version.
Leave it unset to use `latest`. Publishing images does not automatically restart
the VPS; run the commands above after a successful workflow to update it.

Allow TCP/UDP 3478 and UDP 49160–49200 through the VPS provider firewall for
TURN. TURN connects directly to `TURN_PUBLIC_IP` (default `43.133.154.211`),
independently of Cloudflare's HTTP proxy. TURN credentials are sent by the
signaling backend when a peer registers. Only register trusted devices: the
existing device signaling endpoint is not authenticated.

The shared Traefik uses HTTP-01 certificate validation on its `web` entrypoint
so certificate issuance works through Cloudflare's HTTP proxy. Keep port 80
reachable and do not block `/.well-known/acme-challenge/` in Cloudflare rules.
The Traefik Compose configuration is managed separately in `/home/faeznz/traefik`.

## Android

```sh
cd client/android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
adb push app/build/outputs/apk/release/app-release.apk /sdcard/Download/cam-stream-mobile.apk
```

The local build uses the existing debug signing key, which is excluded from Git.
For a fresh checkout, provide a local debug keystore or configure a release key.
Open the app, enter a device name, and register with
`wss://cam.faeznz.my.id/ws`. Open the dashboard and select Start for that device.
Camera/microphone access is required on Android.

## Multiple phones

Select **Tambah HP** in the dashboard to download the Android APK and copy the
shared WebSocket address. Install the same APK on each phone, choose a recognizable
name, and select Register. Each phone has a separate device ID and appears in
the camera grid automatically.

Use **Nyalakan semua** to request all connected cameras at once, or **Nyalakan**
on an individual card. **Hentikan** affects only that camera; **Hentikan semua**
stops all requested/live cameras. The dashboard reports connecting, live, and
failed connections independently for each device. Keep the app available on each
phone and grant camera/microphone permissions when starting its first stream.

To provide the dashboard APK download, copy the local APK to
`/home/faeznz/cam-stream-mobile/downloads/cam-stream-mobile.apk` on the VPS.
Compose mounts that folder read-only into Nginx. APKs are excluded from Git.

## Smoke check

Run from the repository root with a configured local `.env`:

```sh
node scripts/smoke.mjs
node scripts/multi-device.mjs
```

This checks production HTML, authenticated/unauthenticated API responses,
WebSocket registration, device discovery, control-message relay, and cleanup.
