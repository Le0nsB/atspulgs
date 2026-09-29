/* node_helper priekš MMM-Radio
 *
 * Vienīgais radio stāvokļa avots (kura stacija, vai skan). Visi klienti
 * (Pi ekrāns, MacBook ar mikrofonu, telefons) sūta komandas šurp un saņem
 * vienu un to pašu RADIO_STATE, tāpēc balss komanda, kas nonāk pie vairākiem
 * klientiem, izpildās vienreiz, un visur redzams tas pats.
 *
 * Kas pašlaik skan: interneta radio straumes (Icecast/SHOUTcast) ik pēc
 * `metaint` baitiem iesūta "StreamTitle='Izpildītājs - Dziesma';". Pārlūka
 * <audio> to nerāda, tāpēc šeit ik pēc `metadataInterval` īsi pieslēdzamies
 * straumei ar "Icy-MetaData: 1", nolasām pirmo metadatu bloku un atvienojamies.
 */
const fs = require("node:fs");
const path = require("node:path");
const NodeHelper = require("node_helper");
const Log = require("logger");

const DEDUPE_MS = 1500;
const STATE_FILE = path.join(path.resolve(__dirname, "..", ".."), "data", "radio.json");

/* ------------------------------ tīras funkcijas ------------------------------ */

function normalize (str) {
	return String(str || "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function levenshtein (a, b) {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		prev = cur;
	}
	return prev[b.length];
}

// "ieslēdz staciju star fm" -> Star FM. Salīdzina ar nosaukumu un `aliases`;
// atstarpes neskaitās ("starfm" = "star fm"), pieļauj nelielas kļūdas.
function findStation (stations, text) {
	const spoken = normalize(text).replace(/ /g, "");
	if (!spoken) return -1;
	let best = -1;
	let bestDist = Infinity;
	stations.forEach((st, i) => {
		for (const name of [st.name, ...(st.aliases || [])]) {
			const n = normalize(name).replace(/ /g, "");
			if (!n) continue;
			if (spoken.includes(n)) {
				if (bestDist > 0) {
					best = i;
					bestDist = 0;
				}
				continue;
			}
			const d = levenshtein(spoken, n);
			if (d <= Math.max(1, Math.floor(n.length / 4)) && d < bestDist) {
				best = i;
				bestDist = d;
			}
		}
	});
	return best;
}

// "StreamTitle='Prāta Vētra - Welcome to My Country';StreamUrl='';" -> { artist, title }
function parseStreamTitle (block) {
	const m = /StreamTitle='(.*?)';/s.exec(block);
	if (!m) return null;
	const raw = m[1].trim();
	if (!raw) return null;
	const sep = raw.indexOf(" - ");
	if (sep > 0) return { artist: raw.slice(0, sep).trim(), title: raw.slice(sep + 3).trim() };
	return { artist: "", title: raw };
}

// Nolasa pirmo ICY metadatu bloku no straumes. null, ja stacija to nesūta.
async function fetchIcyTitle (url, timeoutMs = 10000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { headers: { "Icy-MetaData": "1" }, signal: controller.signal });
		const metaint = Number(res.headers.get("icy-metaint"));
		if (!res.ok || !metaint || !res.body) return null;
		const reader = res.body.getReader();
		let buf = Buffer.alloc(0);
		while (true) {
			const { done, value } = await reader.read();
			if (done) return null;
			buf = Buffer.concat([buf, Buffer.from(value)]);
			if (buf.length > metaint) {
				const len = buf[metaint] * 16;
				if (len === 0) return null; // šajā intervālā nosaukums nav mainījies/nav
				if (buf.length >= metaint + 1 + len) {
					return parseStreamTitle(buf.subarray(metaint + 1, metaint + 1 + len).toString("utf8"));
				}
			}
			if (buf.length > metaint + 1 + 255 * 16) return null;
		}
	} catch (err) {
		return null;
	} finally {
		clearTimeout(timer);
		controller.abort(); // atvienojamies no straumes — audio mums šeit nevajag
	}
}

module.exports = NodeHelper.create({
	start () {
		this.stations = [];
		this.config = null;
		this.state = { playing: false, index: 0, track: null };
		this.metaTimer = null;
		this.recent = new Map();
		try {
			const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
			if (Number.isInteger(saved.index)) this.state.index = saved.index;
		} catch (err) {
			// nav saglabātas stacijas — sākam no pirmās
		}
	},

	stop () {
		clearTimeout(this.metaTimer);
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "RADIO_CONFIG") {
			this.config = payload;
			this.stations = Array.isArray(payload.stations) ? payload.stations : [];
			if (this.state.index >= this.stations.length) this.state.index = 0;
			this.broadcast();
			return;
		}
		if (notification === "RADIO_CMD" && payload && !this.isDuplicate(payload)) {
			this.command(payload.action, payload.value);
		}
	},

	isDuplicate (payload) {
		const now = Date.now();
		for (const [k, t] of this.recent) if (now - t > DEDUPE_MS) this.recent.delete(k);
		const key = `${payload.action}:${JSON.stringify(payload.value ?? null)}`;
		if (this.recent.has(key)) return true;
		this.recent.set(key, now);
		return false;
	},

	command (action, value) {
		if (!this.stations.length) return;
		const n = this.stations.length;
		const s = this.state;
		switch (action) {
			case "play":
				if (Number.isInteger(value) && value >= 0 && value < n) s.index = value;
				s.playing = true;
				break;
			case "play_named": {
				const i = findStation(this.stations, value);
				if (i < 0) {
					this.sendSocketNotification("RADIO_NOT_FOUND", String(value || ""));
					return;
				}
				s.index = i;
				s.playing = true;
				break;
			}
			case "stop":
				if (!s.playing) return;
				s.playing = false;
				break;
			case "toggle":
				s.playing = !s.playing;
				break;
			case "next":
				s.index = (s.index + 1) % n;
				s.playing = true;
				break;
			case "prev":
				s.index = (s.index - 1 + n) % n;
				s.playing = true;
				break;
			case "failed": // pārlūks nevarēja atskaņot straumi
				if (value !== s.index) return;
				s.playing = false;
				this.sendSocketNotification("RADIO_FAILED", this.stations[s.index].name);
				break;
			default:
				return;
		}
		s.track = null;
		this.save();
		this.broadcast();
		this.scheduleMetadata(0);
	},

	save () {
		try {
			fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
			fs.writeFileSync(STATE_FILE, JSON.stringify({ index: this.state.index }));
		} catch (err) {
			// nav kritiski — nākamreiz sāksies no pirmās stacijas
		}
	},

	broadcast () {
		const st = this.stations[this.state.index] || null;
		this.sendSocketNotification("RADIO_STATE", {
			playing: this.state.playing,
			index: this.state.index,
			station: st ? { name: st.name, url: st.url, logo: st.logo || null } : null,
			track: this.state.track
		});
	},

	scheduleMetadata (delay) {
		clearTimeout(this.metaTimer);
		if (!this.state.playing || !this.config || this.config.showTrack === false) return;
		this.metaTimer = setTimeout(() => this.pollMetadata(), delay);
	},

	async pollMetadata () {
		const index = this.state.index;
		const st = this.stations[index];
		if (!st || !this.state.playing) return;
		const track = await fetchIcyTitle(st.url);
		// Kamēr gaidījām, stacija varēja mainīties.
		if (!this.state.playing || this.state.index !== index) return;
		if (JSON.stringify(track) !== JSON.stringify(this.state.track)) {
			this.state.track = track;
			this.broadcast();
		}
		this.scheduleMetadata(Math.max(10000, this.config.metadataInterval || 30000));
	}
});

// Testiem (tests/unit/modules/custom/radio_helper_spec.js).
module.exports.findStation = findStation;
module.exports.parseStreamTitle = parseStreamTitle;
module.exports.fetchIcyTitle = fetchIcyTitle;
