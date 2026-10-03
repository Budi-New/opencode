#!/bin/bash
# Deploy telecoder: file sudah di-scp, tinggal pasang service
set -u
SUDO="echo TTR0M21hdGlrQA== | base64 -d | sudo -S"
mkdir -p /home/cyberzone/telecoder
chmod 600 /home/cyberzone/telecoder/bot.env 2>/dev/null
cat > /tmp/telecoder.service <<'EOF'
[Unit]
Description=Telecoder Telegram-OpenCode gateway
After=network.target opencode-serve.service
[Service]
User=cyberzone
WorkingDirectory=/home/cyberzone/telecoder
EnvironmentFile=/home/cyberzone/telecoder/bot.env
ExecStart=/usr/bin/node /home/cyberzone/telecoder/telecoder.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
eval "$SUDO cp /tmp/telecoder.service /etc/systemd/system/telecoder.service"
eval "$SUDO systemctl daemon-reload"
eval "$SUDO systemctl enable telecoder"
eval "$SUDO systemctl restart telecoder"
sleep 6
systemctl is-active telecoder
journalctl -u telecoder --no-pager -n 6 2>/dev/null | tail -6
echo TELECODER_DONE
