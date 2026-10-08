#!/usr/bin/env bash
# Called by comitup (via `external_callback` in /etc/comitup.conf) with a
# single argument: HOTSPOT, CONNECTING, or CONNECTED. Writes the state — and,
# in HOTSPOT mode, the actual broadcast SSID and its password — to a JSON file
# that MMM-WifiSetup's node_helper polls, so the mirror screen can show setup
# instructions and a WiFi QR code.
#
# install.sh copies this script to /usr/local/bin/mm-wifi-state-callback,
# owned by root: comitup runs the callback as the file's owner, and only root
# can write /run and read the password from /etc/comitup.conf.
#
# The file is world-readable (MagicMirror doesn't run as root) and holds the
# hotspot password only while the hotspot is up. That's fine: the same
# password is on the mirror screen at that moment, and /run is wiped on reboot.

set -euo pipefail

STATE="${1:-}"
OUT=/run/mm-wifi-state.json
CONF=/etc/comitup.conf
SSID=""
PASSWORD=""

json_escape() {
	local s=$1
	s=${s//\\/\\\\}
	s=${s//\"/\\\"}
	printf '%s' "$s"
}

if [[ "$STATE" == "HOTSPOT" ]]; then
	CONN=$(nmcli -t -f GENERAL.CONNECTION device show wlan0 2>/dev/null | cut -d: -f2)
	if [[ -n "$CONN" ]]; then
		SSID=$(nmcli -t -f 802-11-wireless.ssid connection show "$CONN" 2>/dev/null | cut -d: -f2-)
	fi
	if [[ -r "$CONF" ]]; then
		PASSWORD=$(sed -n 's/^ap_password:[[:space:]]*//p' "$CONF" | tail -n 1 | sed 's/[[:space:]]*$//')
	fi
fi

printf '{"state":"%s","ssid":"%s","password":"%s","portal":"http://10.41.0.1"}\n' \
	"$(json_escape "$STATE")" "$(json_escape "$SSID")" "$(json_escape "$PASSWORD")" > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
chmod 644 "$OUT"
