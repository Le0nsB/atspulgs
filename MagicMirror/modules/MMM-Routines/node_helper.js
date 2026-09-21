/* node_helper priekš MMM-Routines
 *
 * Glabā treniņa stāvokli (izvēlētās ķermeņa daļas, inventārs, šodienas treniņš,
 * līmenis, vēsture) failā data.json un piedāvā:
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
const { TARGETS, EQUIPMENT, FEEDBACK, MAX_LEVEL, generateWorkout, adjustLevel, videoUrlFor, mediaFor } = require("./exercises");

const DATA_FILE = path.join(__dirname, "data.json");
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
		this.state = this.load();
		this.registerRoutes();
		Log.info("MMM-Routines node_helper startēts.");
	},

	/* ------------------------- glabāšana ------------------------- */

	load () {
		const fresh = { prefs: { targets: [], equipment: [] }, level: 1, workout: null, lastPromptAt: 0, history: [] };
		try {
			const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
			return { ...fresh, ...saved, prefs: { ...fresh.prefs, ...saved.prefs } };
		} catch (error) {
			if (error.code !== "ENOENT") Log.warn(`MMM-Routines: neizdevās ielasīt data.json (${error.message}), sāku no nulles`);
			return fresh;
		}
	},

	save () {
		try {
			const tmp = `${DATA_FILE}.tmp`;
			fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
			fs.renameSync(tmp, DATA_FILE);
		} catch (error) {
			Log.error(`MMM-Routines: neizdevās saglabāt data.json: ${error.message}`);
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
		this.state.history.push({
			date: workout.date,
			targets: workout.targets,
			level: levelBefore,
			feedback
		});
		if (this.state.history.length > HISTORY_LIMIT) this.state.history.splice(0, this.state.history.length - HISTORY_LIMIT);
	},

	// Jaunā dienā vakardienas treniņš vairs nav aktuāls: ja bija pabeigts bez atbildes,
	// aizver to; pēc tam (ja preferences zināmas) uzģenerē šodienas treniņu.
	ensureToday () {
		const w = this.state.workout;
		if (!w || w.date === todayStr()) return;
		if (w.status === "awaiting_feedback") {
			w.status = "done";
			this.pushHistory(w, null, w.level);
		}
		if (this.state.prefs.targets.length) this.newWorkout(this.state.prefs, w.exercises.map((e) => e.id));
		this.save();
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
	},

	/* ------------------------- darbības ------------------------- */

	generate (body = {}) {
		const targets = cleanIds(body.targets ?? this.state.prefs.targets, TARGETS);
		const equipment = cleanIds(body.equipment ?? this.state.prefs.equipment, EQUIPMENT);
		if (!targets.length) throw new Error("Izvēlies vismaz vienu ķermeņa daļu.");

		this.state.prefs = { targets, equipment };
		const avoid = this.state.workout ? this.state.workout.exercises.map((e) => e.id) : [];
		this.newWorkout(this.state.prefs, avoid);
		this.save();
		this.broadcastState();
	},

	complete () {
		this.ensureToday();
		const w = this.state.workout;
		if (!w || w.status !== "pending") return false;
		w.status = "awaiting_feedback";
		w.completedAt = Date.now();
		this.save();
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
		this.pushHistory(w, value, before);
		this.save();
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
		this.save();
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
		// Tikai application/json: šādu POST no citas vietnes pārlūks bez CORS atļaujas nesūtīs
		// (vajadzētu preflight), tāpēc svešas lapas nevar "iedurt" API, ja atver to telefonā.
		const parse = express.json({ limit: "10kb" });
		const json = (req, res, next) => {
			if (!req.is("application/json")) return res.status(415).json({ error: "Vajag Content-Type: application/json" });
			parse(req, res, next);
		};

		app.get("/routines", (req, res) => {
			res.set("Cache-Control", "no-cache");
			res.sendFile(path.join(__dirname, "public", "index.html"));
		});

		app.get("/routines/api/state", (req, res) => res.json(this.publicState()));

		const action = (fn) => (req, res) => {
			try {
				fn(req.body || {});
				res.json(this.publicState());
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		};

		app.post("/routines/api/generate", json, action((body) => this.generate(body)));
		app.post("/routines/api/complete", json, action(() => this.complete()));
		app.post("/routines/api/feedback", json, action((body) => {
			if (!this.feedback(body.feedback)) throw new Error("Šobrīd nav treniņa, par kuru sniegt atbildi.");
		}));
	}
});
