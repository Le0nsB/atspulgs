/* node_helper priekš MMM-Routines
 *
 * Glabā treniņa stāvokli (izvēlētās ķermeņa daļas, inventārs, šodienas treniņš,
 * līmenis, vēsture) SQLite datubāzē data/routines.db (sk. db.js) un piedāvā:
 *   • telefona lapu  http://<pi-ip>:8080/routines  (izvēle, "ģenerēt citu", "pabeigts")
 *   • JSON API tai pašai lapai  /routines/api/*
 *   • lēmumu, kad spogulis jautā "vai treniņš pabeigts?" (klients pasaka, ka seja
 *     parādījās; šeit tiek pārbaudīta 1 h pauze, lai nejautātu katru reizi)
 *
 * Visa loģika ir šeit (nevis klientā), jo pie Pi var būt pieslēgti vairāki klienti
 * (Electron + MacBook balss klausītājs) — tā stāvoklis un pauze ir viens un tas pats.
 * Komandas (pabeigts / atbilde) ir idempotentas: dubultsignāls neko nesabojā.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const phoneAuth = require("../../lib/phone-auth");
const { RoutinesStore } = require("./db");
const { TARGETS, EQUIPMENT, FEEDBACK, MAX_LEVEL, generateWorkout, adjustLevel, videoUrlFor, mediaFor } = require("./exercises");

// Ārpus modules/ — MagicMirror to mapi atdod pa HTTP, tāpēc no turienes datubāzi varētu lejupielādēt.
const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const DB_FILE = path.join(DATA_DIR, "routines.db");
const LEGACY_JSON = path.join(__dirname, "data.json");
const HISTORY_LIMIT = 90;

const todayStr = () => {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const cleanIds = (list, allowed) => {
	if (!Array.isArray(list)) return [];
	const ids = new Set(allowed.map((a) => a.id));
	return [...new Set(list)].filter((id) => ids.has(id));
};

module.exports = NodeHelper.create({
	start () {
		this.config = { promptCooldownMs: 60 * 60 * 1000, port: 8080 };
		fs.mkdirSync(DATA_DIR, { recursive: true });
		this.store = new RoutinesStore(DB_FILE, { historyLimit: HISTORY_LIMIT });
		try {
			if (this.store.importJson(LEGACY_JSON, path.join(DATA_DIR, "routines-data.json.migrated"))) Log.info("MMM-Routines: data.json pārnests uz data/routines.db");
		} catch (error) {
			Log.warn(`MMM-Routines: neizdevās pārnest data.json (${error.message})`);
		}
		this.state = this.store.load();
		this.registerRoutes();
		Log.info("MMM-Routines node_helper startēts.");
	},

	/* ------------------------- glabāšana ------------------------- */

	// Atmiņā glabā to pašu stāvokli (this.state) kā kešatmiņu; katra izmaiņa uzreiz
	// tiek ierakstīta datubāzē ar mērķtiecīgu vaicājumu (nevis viss fails no jauna).
	persist (what) {
		try {
			what();
		} catch (error) {
			Log.error(`MMM-Routines: neizdevās saglabāt datubāzē: ${error.message}`);
		}
	},

	/* ------------------------- stāvoklis ------------------------- */

	urls () {
		const port = this.config.port;
		const out = [];
		for (const addrs of Object.values(os.networkInterfaces())) {
			for (const a of addrs || []) {
				if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${port}/routines`);
			}
		}
		out.push(`http://${os.hostname()}.local:${port}/routines`);
		return out;
	},

	publicState () {
		this.ensureToday();
		// Attēli un video saite tiek pievienoti šeit (nevis glabāti), lai strādā arī jau saglabātiem treniņiem.
		const w = this.state.workout;
		const workout = w ? { ...w, exercises: w.exercises.map((e) => ({ ...e, videoUrl: videoUrlFor(e.id), media: mediaFor(e.id) })) } : null;
		return {
			options: { targets: TARGETS, equipment: EQUIPMENT },
			prefs: this.state.prefs,
			level: this.state.level,
			maxLevel: MAX_LEVEL,
			workout,
			urls: this.urls()
		};
	},

	broadcastState () {
		this.sendSocketNotification("ROUTINES_STATE", this.publicState());
	},

	pushHistory (workout, feedback, levelBefore) {
		const entry = { date: workout.date, targets: workout.targets, level: levelBefore, feedback };
		this.state.history.push(entry);
		if (this.state.history.length > HISTORY_LIMIT) this.state.history.splice(0, this.state.history.length - HISTORY_LIMIT);
		this.persist(() => this.store.addHistory(workout.id, entry));
	},

	// Jaunā dienā vakardienas treniņš vairs nav aktuāls: ja bija pabeigts bez atbildes,
	// aizver to; pēc tam (ja preferences zināmas) uzģenerē šodienas treniņu.
	ensureToday () {
		const w = this.state.workout;
		if (!w || w.date === todayStr()) return;
		if (w.status === "awaiting_feedback") {
			w.status = "done";
			this.persist(() => this.store.updateWorkoutStatus(w));
			this.pushHistory(w, null, w.level);
		}
		if (this.state.prefs.targets.length) this.newWorkout(this.state.prefs, w.exercises.map((e) => e.id));
	},

	newWorkout (prefs, avoid = []) {
		const result = generateWorkout({
			targets: prefs.targets,
			equipment: prefs.equipment,
			level: this.state.level,
			avoid
		});
		this.state.workout = {
			id: Date.now().toString(36),
			date: todayStr(),
			generatedAt: Date.now(),
			targets: prefs.targets,
			equipment: prefs.equipment,
			level: result.level,
			sets: result.sets,
			restSeconds: result.restSeconds,
			exercises: result.exercises,
			status: "pending", // pending -> awaiting_feedback -> done
			completedAt: null,
			feedback: null
		};
		this.persist(() => this.store.insertWorkout(this.state.workout));
	},

	/* ------------------------- darbības ------------------------- */

	generate (body = {}) {
		const targets = cleanIds(body.targets ?? this.state.prefs.targets, TARGETS);
		const equipment = cleanIds(body.equipment ?? this.state.prefs.equipment, EQUIPMENT);
		if (!targets.length) throw new Error("Izvēlies vismaz vienu ķermeņa daļu.");

		this.state.prefs = { targets, equipment };
		this.persist(() => this.store.savePrefs(this.state.prefs));
		const avoid = this.state.workout ? this.state.workout.exercises.map((e) => e.id) : [];
		this.newWorkout(this.state.prefs, avoid);
		this.broadcastState();
	},

	complete () {
		this.ensureToday();
		const w = this.state.workout;
		if (!w || w.status !== "pending") return false;
		w.status = "awaiting_feedback";
		w.completedAt = Date.now();
		this.persist(() => this.store.updateWorkoutStatus(w));
		this.broadcastState();
		this.sendSocketNotification("ROUTINES_ASK", { kind: "feedback" });
		return true;
	},

	feedback (value) {
		const w = this.state.workout;
		if (!FEEDBACK.includes(value) || !w || w.status !== "awaiting_feedback") return false;
		const before = this.state.level;
		this.state.level = adjustLevel(before, value);
		w.status = "done";
		w.feedback = value;
		this.persist(() => {
			this.store.saveLevel(this.state.level);
			this.store.updateWorkoutStatus(w);
		});
		this.pushHistory(w, value, before);
		this.broadcastState();
		this.sendSocketNotification("ROUTINES_RESULT", { feedback: value, before, after: this.state.level });
		return true;
	},

	// Seja parādījās spoguļa priekšā: pajautā, ja ir nepabeigts treniņš un pagājusi pauze.
	facePresent () {
		this.ensureToday();
		const w = this.state.workout;
		if (!w || w.status === "done") return;
		const now = Date.now();
		if (now - this.state.lastPromptAt < this.config.promptCooldownMs) return;
		this.state.lastPromptAt = now;
		this.persist(() => this.store.saveLastPromptAt(now));
		this.sendSocketNotification("ROUTINES_ASK", { kind: w.status === "pending" ? "complete" : "feedback" });
	},

	socketNotificationReceived (notification, payload) {
		switch (notification) {
			case "ROUTINES_INIT":
				if (payload && Number.isFinite(payload.promptCooldownMs)) this.config.promptCooldownMs = payload.promptCooldownMs;
				if (payload && Number.isFinite(payload.port)) this.config.port = payload.port;
				this.broadcastState();
				break;
			case "ROUTINES_FACE_PRESENT":
				this.facePresent();
				break;
			case "ROUTINES_COMPLETE":
				this.complete();
				break;
			case "ROUTINES_FEEDBACK":
				this.feedback(payload);
				break;
		}
	},

	/* ------------------------- HTTP (telefona lapa + API) ------------------------- */

	registerRoutes () {
		const app = this.expressApp;
		// Kas drīkst: tikai pieslēgts telefons (vai pats Pi) — skat. lib/phone-auth.js.
		phoneAuth.install(app);
		const guard = phoneAuth.guard();
		// Tikai application/json: šādu POST no citas vietnes pārlūks bez CORS atļaujas
		// nesūtīs (vajadzētu preflight). Tā nav autentifikācija — to dara `guard`.
		const parse = express.json({ limit: "10kb" });
		const json = (req, res, next) => {
			if (!req.is("application/json")) return res.status(415).json({ error: "Vajag Content-Type: application/json" });
			parse(req, res, next);
		};

		app.get("/routines", phoneAuth.page(path.join(__dirname, "public", "index.html")));

		app.get("/routines/api/state", guard, (req, res) => res.json(this.publicState()));

		const action = (fn) => (req, res) => {
			try {
				fn(req.body || {});
				res.json(this.publicState());
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		};

		app.post("/routines/api/generate", guard, json, action((body) => this.generate(body)));
		app.post("/routines/api/complete", guard, json, action(() => this.complete()));
		app.post("/routines/api/feedback", guard, json, action((body) => {
			if (!this.feedback(body.feedback)) throw new Error("Šobrīd nav treniņa, par kuru sniegt atbildi.");
		}));
		// Izrakstīšanās (lapa /signout): viss no sākuma nākamajam lietotājam.
		app.post("/routines/api/reset", guard, json, action(() => {
			this.store.reset();
			this.state = this.store.load();
			this.broadcastState();
		}));
	}
});
