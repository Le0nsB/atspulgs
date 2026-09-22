#!/usr/bin/env bash
# Called by comitup (via `external_callback` in /etc/comitup.conf) with a
# single argument: HOTSPOT, CONNECTING, or CONNECTED. Writes the state — and,
# in HOTSPOT mode, the actual broadcast SSID — to a JSON file that
# MMM-WifiSetup's node_helper polls, so the mirror screen can show setup
# instructions.

set -euo pipefail

STATE="${1:-}"
OUT=/run/mm-wifi-state.json
SSID=""

if [[ "$STATE" == "HOTSPOT" ]]; then
	CONN=$(nmcli -t -f GENERAL.CONNECTION device show wlan0 2>/dev/null | cut -d: -f2)
	if [[ -n "$CONN" ]]; then
		SSID=$(nmcli -t -f 802-11-wireless.ssid connection show "$CONN" 2>/dev/null | cut -d: -f2)
	fi
fi

printf '{"state":"%s","ssid":"%s","portal":"http://10.41.0.1"}\n' "$STATE" "$SSID" > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
chmod 644 "$OUT"
