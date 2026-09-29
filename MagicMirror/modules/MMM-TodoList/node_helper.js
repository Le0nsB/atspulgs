/* node_helper priekš MMM-TodoList
 *
 * Paša spoguļa uzdevumu un iepirkumu saraksts — bez ārēja servisa un konta.
 * Dati glabājas SQLite datubāzē data/todo.db (sk. db.js), un tos var mainīt:
 *   • telefonā  http://<pi-ip>:8080/todo  (poga "Saraksti" tālvadībā vai QR
 *     kods spoguļa lapā) — pievienot, atzīmēt, pārkārtot, dzēst;
 *   • ar balsi (MMM-VoiceCommands):
 *       TODOLIST_COMPLETE { list }        — atzīmē augšējo ierakstu sarakstā
 *       TODOLIST_COMPLETE { list, text }  — atzīmē ierakstu, kura nosaukums
 *                                            vislabāk sakrīt ar teikto ("nopirku pienu" -> "Piens")
 *       TODOLIST_ADD { list, text }       — pievieno jaunu ierakstu
 * Katra izmaiņa uzreiz aiziet visiem spoguļa klientiem (TODOLIST_DATA).
 *
 * Visa loģika ir šeit (nevis klientā), jo pie Pi var būt pieslēgti vairāki
 * klienti (TV + MacBook balss klausītājs) — tie saņem vienu un to pašu balss
 * komandu, bet saraksts mainās tikai vienreiz (dedublēšana).
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const NodeHelper = require("node_helper");
const Log = require("logger");
const express = require("express");
const { TodoStore, LISTS } = require("./db");

// Ārpus modules/ — MagicMirror to mapi atdod pa HTTP, tāpēc no turienes datubāzi varētu lejupielādēt.
const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "todo.db");
const DEDUPE_MS = 3000;

// QR kods telefona lapai — bibliotēka jau ir MMM-Remote-Control atkarībās.
// Ja tās nav, spogulis rāda tikai adresi.
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

/* ------------------------- teksta sakritība (tīras funkcijas) ------------------------- */

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

// Vai divi vārdi ir "tas pats vārds" latviešu valodā: locījumu galotnes
// atšķiras ("piens"/"pienu", "maize"/"maizi"), tāpēc salīdzinām ar pielaidi
// un pēc kopīgās saknes (pirmie burti).
function wordSimilarity (spoken, item) {
	if (spoken === item) return 1;
	const maxLen = Math.max(spoken.length, item.length);
	if (maxLen < 3) return 0;
	const d = levenshtein(spoken, item);
	const byDistance = d <= Math.max(1, Math.floor(maxLen / 3)) ? 1 - d / maxLen : 0;
	let common = 0;
	while (common < spoken.length && common < item.length && spoken[common] === item[common]) common++;
	const byStem = common >= 4 || (common >= 3 && Math.min(spoken.length, item.length) <= 5) ? common / maxLen + 0.2 : 0;
	return Math.min(1, Math.max(byDistance, byStem));
}

// Punkti 0..1 — cik labi teiktais teksts sakrīt ar ieraksta nosaukumu.
// Katram ieraksta vārdam meklē labāko teiktā vārdu; vidējais pa ieraksta
// vārdiem (īsi palīgvārdi netiek skaitīti).
function matchScore (spokenText, itemText) {
	const spoken = normalize(spokenText).split(" ").filter(Boolean);
	const words = normalize(itemText).split(" ").filter((w) => w.length >= 3);
	if (!spoken.length || !words.length) return 0;
	let total = 0;
	for (const w of words) {
		let best = 0;
		for (const s of spoken) best = Math.max(best, wordSimilarity(s, w));
		total += best;
	}
	return total / words.length;
}

// Atrod labāko ierakstu; null, ja nekas nesakrīt pietiekami droši.
function findBestItem (items, spokenText, minScore = 0.5) {
	let best = null;
	let bestScore = 0;
	for (const item of items) {
		const score = matchScore(spokenText, item.content);
		if (score > bestScore) {
			bestScore = score;
			best = item;
		}
	}
	return bestScore >= minScore ? best : null;
}

// "pienu" -> "Pienu": pirmais burts ar lielo, kā cilvēki raksta sarakstā.
function capitalize (text) {
	const t = String(text || "").trim();
	return t ? t[0].toLocaleUpperCase("lv-LV") + t.slice(1) : t;
}

module.exports = NodeHelper.create({
	start () {
		fs.mkdirSync(DATA_DIR, { recursive: true });
		this.store = this.openStore();
		this.recent = new Map(); // dedupe atslēga -> laiks
		this.purge();
		this.purgeTimer = setInterval(() => this.purge(), 6 * 60 * 60 * 1000);
		this.registerRoutes();
		Log.info("MMM-TodoList node_helper startēts.");
	},

	openStore () {
		return new TodoStore(DB_FILE);
	},

	stop () {
		clearInterval(this.purgeTimer);
		if (this.store) this.store.close();
	},

	purge () {
		try {
			this.store.purgeOldDone();
		} catch (error) {
			Log.warn(`MMM-TodoList: neizdevās notīrīt vecos ierakstus: ${error.message}`);
		}
	},

	/* ------------------------- stāvoklis ------------------------- */

	mirrorState () {
		return { tasks: this.store.open("tasks"), shopping: this.store.open("shopping") };
	},

	phoneState () {
		return {
			...this.mirrorState(),
			done: { tasks: this.store.done("tasks"), shopping: this.store.done("shopping") }
		};
	},

	broadcast () {
		this.sendSocketNotification("TODOLIST_DATA", this.mirrorState());
	},

	phoneUrls () {
		const port = (global.config && global.config.port) || 8080;
		const out = [];
		for (const addrs of Object.values(os.networkInterfaces())) {
			for (const a of addrs || []) {
				if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${port}/todo`);
			}
		}
		out.push(`http://${os.hostname()}.local:${port}/todo`);
		return out;
	},

	async sendPhoneLink () {
		const url = this.phoneUrls()[0];
		let qrSvg = null;
		const qr = loadQrCode();
		if (qr) {
			try {
				qrSvg = await qr.toString(url, { type: "svg", margin: 2 });
			} catch (error) {
				Log.warn(`MMM-TodoList: neizdevās izveidot QR kodu: ${error.message}`);
			}
		}
		this.sendSocketNotification("TODOLIST_PHONE_LINK", { url, qrSvg });
	},

	/* ------------------------- balss komandas ------------------------- */

	socketNotificationReceived (notification, payload) {
		if (notification === "TODOLIST_CONFIG") {
			this.broadcast();
			this.sendPhoneLink();
			return;
		}
		if (!payload || !LISTS.includes(payload.list) || this.isDuplicate(notification, payload)) return;
		try {
			if (notification === "TODOLIST_COMPLETE") {
				if (payload.text) this.completeMatching(payload.list, payload.text);
				else this.completeTop(payload.list);
			} else if (notification === "TODOLIST_ADD") {
				this.addItem(payload.list, payload.text);
			}
		} catch (error) {
			Log.error(`MMM-TodoList: ${error.message}`);
		}
	},

	isDuplicate (notification, payload) {
		const now = Date.now();
		for (const [k, t] of this.recent) if (now - t > DEDUPE_MS) this.recent.delete(k);
		const key = `${notification}:${payload.list || ""}:${normalize(payload.text)}`;
		if (this.recent.has(key)) return true;
		this.recent.set(key, now);
		return false;
	},

	markDone (item) {
		this.store.setDone(item.id, true);
		Log.info(`MMM-TodoList: atzīmēts (${item.list}): ${item.content}`);
		this.broadcast();
		this.sendSocketNotification("TODOLIST_DONE", { list: item.list, content: item.content });
	},

	// "Uzdevums pabeigts" bez nosaukuma — augšējais ieraksts.
	completeTop (list) {
		const [first] = this.store.open(list);
		if (!first) {
			this.sendSocketNotification("TODOLIST_NOT_FOUND", { list, text: "" });
			return;
		}
		this.markDone(first);
	},

	// "Nopirku pienu" -> meklē vispirms norādītajā sarakstā, tad otrā.
	completeMatching (list, text) {
		const order = list === "shopping" ? ["shopping", "tasks"] : ["tasks", "shopping"];
		for (const l of order) {
			const item = findBestItem(this.store.open(l), text);
			if (item) {
				this.markDone(item);
				return;
			}
		}
		this.sendSocketNotification("TODOLIST_NOT_FOUND", { list, text });
	},

	addItem (list, text) {
		const { item, added } = this.store.add(list, capitalize(text));
		if (added) {
			Log.info(`MMM-TodoList: pievienots (${list}): ${item.content}`);
			this.broadcast();
		}
		this.sendSocketNotification("TODOLIST_ADDED", { list, content: item.content });
	},

	/* ------------------------- HTTP (telefona lapa + API) ------------------------- */

	registerRoutes () {
		const app = this.expressApp;
		// Tikai application/json (tāpat kā /routines, /calendar): svešas lapas bez
		// CORS šādu POST nevar nosūtīt, ja kāds tās atver telefonā.
		const parse = express.json({ limit: "10kb" });
		const json = (req, res, next) => {
			if (!req.is("application/json")) return res.status(415).json({ error: "Vajag Content-Type: application/json" });
			parse(req, res, next);
		};
		const action = (fn) => (req, res) => {
			try {
				fn(req.body || {});
				this.broadcast();
				res.json(this.phoneState());
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		};

		app.get("/todo", (req, res) => {
			res.set("Cache-Control", "no-cache");
			res.sendFile(path.join(__dirname, "public", "index.html"));
		});
		app.get("/todo/api/state", (req, res) => res.json(this.phoneState()));
		app.post("/todo/api/add", json, action((b) => this.store.add(b.list, b.content)));
		app.post("/todo/api/done", json, action((b) => this.store.setDone(b.id, b.done !== false)));
		app.post("/todo/api/rename", json, action((b) => this.store.rename(b.id, b.content)));
		app.post("/todo/api/delete", json, action((b) => this.store.remove(b.id)));
		app.post("/todo/api/move", json, action((b) => this.store.move(b.id, Number(b.direction))));
		app.post("/todo/api/clear-done", json, action((b) => this.store.clearDone(b.list)));
	}
});

// Testiem (tests/unit/modules/custom/todolist_helper_spec.js).
module.exports.matchScore = matchScore;
module.exports.findBestItem = findBestItem;
module.exports.capitalize = capitalize;
