#!/bin/sh
set -e

cat > /etc/coturn/turnserver.conf <<EOF
listening-port=3478
tls-listening-port=5349
realm=cam.faeznz.my.id
user=${TURN_USERNAME}:${TURN_PASSWORD}
cert=/etc/coturn_certs/fullchain.pem
pkey=/etc/coturn_certs/privkey.pem
no-sslv3
no-tlsv1
no-tlsv1_1
stale-nonce
EOF

exec turnserver -c /etc/coturn/turnserver.conf "$@"
