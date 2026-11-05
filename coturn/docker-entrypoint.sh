#!/bin/sh
set -eu
exec turnserver --log-file=stdout --no-cli --no-tls --no-dtls \
  --listening-port=3478 --realm=cam.faeznz.my.id --fingerprint \
  --lt-cred-mech --user="${TURN_USERNAME}:${TURN_PASSWORD}" \
  --external-ip="${TURN_PUBLIC_IP}" --min-port=49160 --max-port=49200 \
  --no-multicast-peers
