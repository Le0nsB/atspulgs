#!/usr/bin/env bash
# Run this ON the Raspberry Pi (Bookworm or later, NetworkManager-based Raspberry Pi OS).
# Sets up comitup so the Pi broadcasts its own WiFi hotspot whenever it can't
# reach a known network, letting you join it from a phone and pick a new
# WiFi/hotspot without a keyboard or monitor attached.
#
# Usage: sudo ./install.sh              # keeps the current hotspot password, or generates one
#        sudo ./install.sh <password>   # sets your own (8–63 characters)
#
# The hotspot always has a password: without one, anyone nearby could join it
# and reach the mirror (remote control, sign-out, calendar) with no login.
# The mirror screen shows the password and a WiFi QR code while the hotspot
# is up (MMM-WifiSetup), so only someone who can see the mirror can join.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo $0 [password]" >&2
  exit 1
fi

if ! command -v nmcli &>/dev/null; then
  echo "NetworkManager not found. comitup needs Raspberry Pi OS Bookworm or later." >&2
  exit 1
fi

CONF=/etc/comitup.conf

# Easy to read off the screen and type: no 0/o, 1/l/i lookalikes, grouped
# like "kp4m-7xqa-2c" (~50 bits). $SRANDOM is seeded from the kernel CSPRNG.
generate_password() {
  if [[ -z "${SRANDOM:-}" ]]; then
    echo "bash 5.1+ is required to generate a password; pass one instead: sudo $0 <password>" >&2
    exit 1
  fi
  local alphabet=abcdefghjkmnpqrstuvwxyz23456789 out="" i
  for i in {1..10}; do
    out+=${alphabet:SRANDOM % ${#alphabet}:1}
  done
  echo "${out:0:4}-${out:4:4}-${out:8:2}"
}

current_password() {
  [[ -f "$CONF" ]] || return 0
  sed -n 's/^ap_password:[[:space:]]*//p' "$CONF" | tail -n 1 | sed 's/[[:space:]]*$//'
}

PASSWORD="${1:-}"
[[ -n "$PASSWORD" ]] || PASSWORD="$(current_password)"
[[ -n "$PASSWORD" ]] || PASSWORD="$(generate_password)"

# WPA2 rule: 8–63 printable ASCII characters.
if (( ${#PASSWORD} < 8 || ${#PASSWORD} > 63 )) || [[ ! "$PASSWORD" =~ ^[[:print:]]+$ ]]; then
  echo "The hotspot password must be 8–63 printable characters." >&2
  exit 1
fi

apt-get update
apt-get install -y comitup

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$SCRIPT_DIR/wifi-state-callback.sh"

if [[ -f "$CONF" ]]; then
  cp "$CONF" "$CONF.bak"
  chmod 600 "$CONF.bak"
fi
# awk + ENVIRON, not sed: the password may contain characters sed would treat specially.
sed "s#__CALLBACK_PATH__#$SCRIPT_DIR/wifi-state-callback.sh#" "$SCRIPT_DIR/comitup.conf" \
  | PW="$PASSWORD" awk '/^ap_password:/ { print "ap_password: " ENVIRON["PW"]; next } { print }' \
  > "$CONF"
chmod 600 "$CONF"

systemctl enable comitup
systemctl restart comitup

cat <<EOF

Done. On next boot (or reboot now with: sudo reboot):
  - If the Pi already knows a WiFi network, it joins it as usual.
  - If not, it broadcasts its own hotspot (see ap_name in $CONF).
    The mirror screen shows its name, password and a QR code — scan the
    code with a phone camera to join, then the WiFi picker opens by itself
    (or open http://10.41.0.1) to choose the real WiFi and enter its password.
  - The Pi remembers it afterwards and falls back to the hotspot again
    any time it loses that network.

  Hotspot password: $PASSWORD
  (Shown on the mirror while the hotspot is up. Change it: sudo $0 <new password>)

Make sure the MMM-WifiSetup module is enabled in config/config.js so the
mirror screen itself shows the hotspot name, password and setup instructions
while this is going on (see modules/MMM-WifiSetup/README.md).
EOF
