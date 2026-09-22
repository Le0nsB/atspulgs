/* MagicMirror²
 * Module: MMM-WifiSetup
 *
 * Rāda pilnekrāna instrukcijas, kad Pi ir comitup izveidotajā WiFi hotspot
 * režīmā (nav zināma tīkla) vai savienojas ar jaunu tīklu — lai bez tastatūras
 * un peles varētu saprast, kā pieslēgt spoguli internetam no tālruņa.
 *
 * Stāvokli (HOTSPOT / CONNECTING / CONNECTED) padod node_helper, kas lasa
 * failu /run/mm-wifi-state.json — to raksta scripts/comitup/wifi-state-callback.sh,
 * ko comitup izsauc caur `external_callback` (skat. scripts/comitup/comitup.conf).
 *
 * MIT Licensed.
 */
Module.register("MMM-WifiSetup", {
	defaults: {
		debug: false
	},

	getStyles () {
		return ["font-awesome.css", "MMM-WifiSetup.css"];
	},

	start () {
		this.state = null;
		this.ssid = "";
		this.portal = "http://10.41.0.1";
		Log.info(`${this.name}: startē.`);
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-wifisetup";

		const card = document.createElement("div");
		card.className = "ws-card";

		const icon = document.createElement("i");
		icon.className = "fa-solid fa-wifi ws-icon";
		card.appendChild(icon);

		const title = document.createElement("div");
		title.className = "ws-title";
		title.textContent = "Nepieciešams WiFi iestatījums";
		card.appendChild(title);

		const status = document.createElement("div");
		status.className = "ws-status";
		const dot = document.createElement("span");
		dot.className = "ws-dot";
		const statusText = document.createElement("span");
		statusText.className = "ws-status-text";
		status.appendChild(dot);
		status.appendChild(statusText);
		card.appendChild(status);

		const ssidLine = document.createElement("div");
		ssidLine.className = "ws-ssid";
		card.appendChild(ssidLine);

		const help = document.createElement("div");
		help.className = "ws-help";
		help.textContent = "Savieno tālruni vai datoru ar šo WiFi tīklu — parasti tūlīt atveras logs tīkla izvēlei. Ja neatveras pats, atver pārlūkā:";
		card.appendChild(help);

		const portalLine = document.createElement("div");
		portalLine.className = "ws-portal";
		card.appendChild(portalLine);

		wrapper.appendChild(card);

		this.wrapper = wrapper;
		this.dotEl = dot;
		this.statusTextEl = statusText;
		this.ssidEl = ssidLine;
		this.portalEl = portalLine;

		this.render();
		return wrapper;
	},

	render () {
		if (!this.wrapper) return;
		const visible = this.state === "HOTSPOT" || this.state === "CONNECTING";
		this.wrapper.classList.toggle("active", visible);
		if (!visible) return;

		this.dotEl.className = `ws-dot ${this.state === "HOTSPOT" ? "ws-dot-hotspot" : "ws-dot-connecting"}`;
		this.statusTextEl.textContent = this.state === "HOTSPOT" ? "Gaida savienojumu" : "Savienojas ar tīklu...";
		this.ssidEl.textContent = this.ssid ? `Tīkla nosaukums: ${this.ssid}` : "Meklē tīkla nosaukumu...";
		this.portalEl.textContent = this.portal;
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "MM_WIFI_STATE") return;
		if (this.config.debug) Log.log(`${this.name}: stāvoklis ${JSON.stringify(payload)}`);
		this.state = payload.state;
		this.ssid = payload.ssid || "";
		this.portal = payload.portal || this.portal;
		this.render();
	}
});
