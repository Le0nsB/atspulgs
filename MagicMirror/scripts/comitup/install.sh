#!/usr/bin/env bash
# Run this ON the Raspberry Pi (Bookworm or later, NetworkManager-based Raspberry Pi OS).
# Sets up comitup so the Pi broadcasts its own WiFi hotspot whenever it can't
# reach a known network, letting you join it from a phone and pick a new
# WiFi/hotspot without a keyboard or monitor attached.
#
# Usage: sudo ./install.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if ! command -v nmcli &>/dev/null; then
  echo "NetworkManager not found. comitup needs Raspberry Pi OS Bookworm or later." >&2
  exit 1
fi

apt-get update
apt-get install -y comitup

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$SCRIPT_DIR/wifi-state-callback.sh"

if [[ -f /etc/comitup.conf ]]; then
  cp /etc/comitup.conf /etc/comitup.conf.bak
fi
sed "s#__CALLBACK_PATH__#$SCRIPT_DIR/wifi-state-callback.sh#" \
  "$SCRIPT_DIR/comitup.conf" > /etc/comitup.conf

systemctl enable comitup
systemctl restart comitup

cat <<'EOF'

Done. On next boot (or reboot now with: sudo reboot):
  - If the Pi already knows a WiFi network, it joins it as usual.
  - If not, it broadcasts its own hotspot (see ap_name in /etc/comitup.conf).
    Connect to it from a phone/laptop, then open http://10.41.0.1 (or wait
    for the captive-portal popup) to pick the real WiFi and enter its password.
  - The Pi remembers it afterwards and falls back to the hotspot again
    any time it loses that network.

Make sure the MMM-WifiSetup module is enabled in config/config.js so the
mirror screen itself shows the hotspot name and setup instructions while
this is going on (see modules/MMM-WifiSetup/README.md).
EOF
