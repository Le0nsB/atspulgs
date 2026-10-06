/* MMM-WifiSetup — node_helper
 *
 * Lasa /run/mm-wifi-state.json, ko raksta scripts/comitup/wifi-state-callback.sh
 * (comitup `external_callback`, izsaukts pie katras WiFi stāvokļa maiņas), un
 * pārraida stāvokli modulim. Ja faila nav (parasti nozīmē: normāli savienots,
 * comitup nekad nav bijis HOTSPOT/CONNECTING režīmā kopš pēdējās callback
 * izsaukšanas), overlay vienkārši paliek paslēpts.
 *
 * HOTSPOT režīmā pievieno WiFi QR kodu (tīkla nosaukums + parole) — telefona
 * kamera to atpazīst un piedāvā pieslēgties bez paroles rakstīšanas.
 */
const fs = require("fs");
const path = require("node:path");
const NodeHelper = require("node_helper");
const Log = require("logger");

const STATE_FILE = "/run/mm-wifi-state.json";
const POLL_MS = 3000;
const ROOT = path.resolve(__dirname, "..", "..");

// QR kods — bibliotēka jau ir MMM-Remote-Control atkarībās (tāpat kā MMM-TodoList).
// Ja tās nav, spogulis rāda tikai tīkla nosaukumu un paroli.
function loadQrCode () {
	for (const id of ["qrcode", path.join(ROOT, "modules", "MMM-Remote-Control", "node_modules", "qrcode")]) {
		try {
			return require(id);
		} catch {
			// mēģina nākamo
		}
	}
	return null;
}

// Standarta WiFi QR teksts (to saprot iPhone un Android kamera):
// WIFI:T:WPA;S:<nosaukums>;P:<parole>;;  — \ ; , : " jāaizsargā ar \.
function wifiQrText (ssid, password) {
	const esc = (s) => String(s).replace(/([\\;,:"])/g, "\\$1");
	return password
		? `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;`
		: `WIFI:T:nopass;S:${esc(ssid)};;`;
}

module.exports = NodeHelper.create({
	start () {
		this.lastRaw = null;
		this.qr = loadQrCode();
		this.timer = setInterval(() => this.check(), POLL_MS);
		this.check();
		Log.info("MMM-WifiSetup node_helper startēts.");
	},

	check () {
		fs.readFile(STATE_FILE, "utf8", async (err, raw) => {
			if (err) return;
			if (raw === this.lastRaw) return;
			this.lastRaw = raw;
			let state;
			try {
				state = JSON.parse(raw);
			} catch (e) {
				Log.error(`MMM-WifiSetup: neizdevās parsēt ${STATE_FILE}: ${e.message}`);
				return;
			}
			state.qrSvg = await this.qrFor(state);
			// Kamēr gaidījām QR, fails varēja mainīties — novecojušu stāvokli nesūtām.
			if (raw === this.lastRaw) this.sendSocketNotification("MM_WIFI_STATE", state);
		});
	},

	async qrFor (state) {
		if (state.state !== "HOTSPOT" || !state.ssid || !this.qr) return null;
		try {
			return await this.qr.toString(wifiQrText(state.ssid, state.password), { type: "svg", margin: 2 });
		} catch (error) {
			Log.warn(`MMM-WifiSetup: neizdevās izveidot QR kodu: ${error.message}`);
			return null;
		}
	}
});

// Testiem (tests/unit/modules/custom/wifisetup_spec.js).
module.exports.wifiQrText = wifiQrText;
