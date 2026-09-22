/* MMM-WifiSetup — node_helper
 *
 * Lasa /run/mm-wifi-state.json, ko raksta scripts/comitup/wifi-state-callback.sh
 * (comitup `external_callback`, izsaukts pie katras WiFi stāvokļa maiņas), un
 * pārraida stāvokli modulim. Ja faila nav (parasti nozīmē: normāli savienots,
 * comitup nekad nav bijis HOTSPOT/CONNECTING režīmā kopš pēdējās callback
 * izsaukšanas), overlay vienkārši paliek paslēpts.
 */
const fs = require("fs");
const NodeHelper = require("node_helper");
const Log = require("logger");

const STATE_FILE = "/run/mm-wifi-state.json";
const POLL_MS = 3000;

module.exports = NodeHelper.create({
	start () {
		this.lastRaw = null;
		this.timer = setInterval(() => this.check(), POLL_MS);
		this.check();
		Log.info("MMM-WifiSetup node_helper startēts.");
	},

	check () {
		fs.readFile(STATE_FILE, "utf8", (err, raw) => {
			if (err) return;
			if (raw === this.lastRaw) return;
			this.lastRaw = raw;
			try {
				this.sendSocketNotification("MM_WIFI_STATE", JSON.parse(raw));
			} catch (e) {
				Log.error(`MMM-WifiSetup: neizdevās parsēt ${STATE_FILE}: ${e.message}`);
			}
		});
	}
});
