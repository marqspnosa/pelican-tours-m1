#!/bin/bash
# ============================================================
#  EC2 user data — boots the Pelican Tours booking app (M1)
#  Paste into: Launch instance → Advanced details → User data
#  AMI: Amazon Linux 2023 · Type: t3.micro · Profile: LabInstanceProfile
#
#  APP_ZIP_URL is pre-set to the course copy of starter-app.
#  To use YOUR copy instead: upload starter-app.zip to an S3 bucket
#  in your lab account, or use your public GitHub repo's zip URL.
# ============================================================
set -eux

APP_ZIP_URL=APP_ZIP_URL="https://github.com/marqspnosa/pelican-tours-m1/archive/refs/heads/master.zip"

dnf install -y nodejs unzip

mkdir -p /opt/pelican
cd /opt/pelican
curl -fsSL "$APP_ZIP_URL" -o app.zip
unzip -o app.zip
# zip layouts vary; find server.js wherever it landed
APP_DIR=$(dirname "$(find /opt/pelican -name server.js | head -1)")

cat >/etc/systemd/system/pelican.service <<EOF
[Unit]
Description=Pelican Tours booking app
After=network.target

[Service]
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node server.js
Environment=PORT=80
Restart=always
# Journal question (M3): this runs as root to bind port 80.
# What's the least-privilege alternative? (Hint: PORT=3000 + ALB target,
# or a systemd socket, or CAP_NET_BIND_SERVICE.)

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now pelican

# Verify from your laptop:  http://<instance-public-ip>/api/health
# (Security group must allow HTTP 80 from your IP or 0.0.0.0/0.)
