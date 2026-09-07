/* MagicMirror² Module: MMM-VoiceCommands
 *
 * Balss komandas latviešu valodā ar aktivācijas vārdu ("Spoguli"),
 * līdzīgi kā Google/Siri: kad pasaka aktivācijas vārdu, ekrāna malas
 * iemirdzas (kā balss asistentiem) un modulis ~8 s gaida komandu.
 *
 * Atpazīšanai izmanto pārlūka Web Speech API (webkitSpeechRecognition).
 * SVARĪGI: MagicMirror noklusējuma Electron klients Web Speech API NEATBALSTA
 * (Chromium izņēma Google runas atslēgu), tāpēc klausīšanās jānotiek pārlūkā,
 * kam ir Web Speech API (piem. Google Chrome).
 *
 * DIVU KLIENTU REŽĪMS (kad Pi displejam nav mikrofona):
 *   • Pi TV displejs  -> Electron/Chromium, nav Web Speech API -> "display" loma
 *     (tikai rāda malu mirdzumu un izpilda komandas).
 *   • Cita ierīce (piem. MacBook Chrome) atver http://<pi-ip>:8080/?voice=listen
 *     -> "listener" loma: klausās mikrofonā un atpazīst.
 * Atpazītā komanda iet caur node_helper (serveri uz Pi), kas to pārraida
 * VISIEM pieslēgtajiem klientiem, tāpēc TV displejs pārslēdz lapu.
 *
 * Loma tiek noteikta automātiski (config `listen: "auto"`) vai piespiedu kārtā
 * ar config `listen: true/false` vai URL `?voice=listen` / `?voice=display`.
 *
 * Saderīgs ar MMM-Pages notifikāciju API (PAGES_GOTO / PAGES_HOME / ...).
 */
Module.register("MMM-VoiceCommands", {
	defaults: {
		lang: "lv-LV",

		// "auto"  -> klausās, ja pārlūkam ir Web Speech API, citādi tikai displejs
		// true    -> vienmēr klausās (šis klients)
		// false   -> nekad neklausās (tikai displejs)
		// URL `?voice=listen` / `?voice=display` / `?voice=off` pārspēj šo.
		listen: "auto",

		// Aktivācijas vārds(-i). Var būt viens teksts vai masīvs.
		activation: ["spoguli", "spogulīt", "spogulīti"],
		activationTimeout: 8000, // cik ilgi (ms) pēc aktivācijas gaidīt komandu
		sameUtteranceCommand: true, // atļaut "spoguli parādi laikapstākļus" vienā elpas vilcienā

		// Nelielu atpazīšanas kļūdu pielaide (Levenšteina attālums vārda līmenī).
		fuzzy: true,
		fuzzyMaxDistance: 2,

		// --- vizuālais efekts (ekrāna malu mirdzums) ---
		glow: true,
		glowListenColor: "rgba(120, 180, 255, 0.55)", // klausās
		glowConfirmColor: "rgba(120, 255, 150, 0.55)", // komanda atpazīta
		glowErrorColor: "rgba(255, 120, 120, 0.5)", // nedzirdēju / kļūda
		glowEdges: ["left", "right", "top", "bottom"], // kuras malas mirdz

		// --- statuss modulī (mazs teksts) ---
		showStatus: true,
		idleText: "", // ko rādīt dīkstāvē ("" = nerādīt neko)

		autoStart: true, // sākt klausīties uzreiz pēc palaišanas
		startDelay: 1500, // ms pirms pirmās klausīšanās (laiks mikrofona atļaujai)
		restartDelay: 400, // ms starp atpazīšanas sesijām
		debug: false,

		// Frāze -> notifikācija. `phrases`: masīvs (der jebkurš sakritums).
		// `payload` nav obligāts. `label`: ko parādīt statusā pēc izpildes.
		commands: [
			{ phrases: ["parādi laikapstākļus", "laikapstākļi", "rādi laiku", "laiks"], notification: "PAGES_GOTO", payload: 0, label: "Laikapstākļi" },
			{ phrases: ["parādi kalendāru", "rādi kalendāru", "kalendārs"], notification: "PAGES_GOTO", payload: 2, label: "Kalendārs" },
			{ phrases: ["parādi ziņas", "rādi ziņas", "ziņas"], notification: "PAGES_GOTO", payload: 3, label: "Ziņas" },
			{ phrases: ["nākamā ziņa", "nākošā ziņa", "cita ziņa"], notification: "NEWSDETAIL_NEXT", label: "Nākamā ziņa" },
			{ phrases: ["uz sākumu", "sākuma lapa", "sākums", "mājas"], notification: "PAGES_HOME", label: "Sākums" },
			{ phrases: ["nākamā lapa", "nākošā lapa", "uz priekšu"], notification: "PAGES_NEXT", label: "Nākamā lapa" },
			{ phrases: ["iepriekšējā lapa", "iepriekšēja lapa", "atpakaļ"], notification: "PAGES_PREV", label: "Iepriekšējā lapa" }
		]
	},

	getStyles () {
		return ["MMM-VoiceCommands.css"];
	},

	start () {
		this.recognition = null;
		this.supported = true;
		this.listening = false; // vai mikrofons pašlaik aktīvs
		this.awaitingCommand = false; // vai gaidām komandu pēc aktivācijas
		this.manuallyStopped = false;
		this.commandTimer = null;
		this.restartTimer = null;
		this.statusResetTimer = null;
		this.remoteHideTimer = null;
		this.errorBackoff = 0;
		this.cooldownUntil = 0;
		this.status = "";
		this.lastTranscript = "";
		this.lastCmdId = null;
		this.overlay = null;

		// Unikāls šī klienta ID (lai atšķirtu, kurš klients atpazina komandu).
		this.clientId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
		this.role = this.resolveRole();
		Log.info(`${this.name}: loma = ${this.role} (clientId=${this.clientId}).`);

		// Priekšapstrādāti (normalizēti) aktivācijas vārdi un komandu frāzes.
		const activation = Array.isArray(this.config.activation)
			? this.config.activation
			: [this.config.activation];
		this.activationNorm = activation
			.map((a) => this.normalize(a).split(" ").filter(Boolean))
			.filter((a) => a.length > 0);

		this.commandsNorm = (this.config.commands || []).map((cmd) => ({
			...cmd,
			phrasesNorm: (cmd.phrases || [])
				.map((p) => this.normalize(p))
				.filter(Boolean)
		}));

		Log.info(`${this.name}: startēts (lang=${this.config.lang}).`);
	},

	// Nosaka, vai šis klients klausās mikrofonā ("listener"), tikai rāda
	// ("display") vai ir pilnībā pasīvs ("off").
	resolveRole () {
		let forced = null;
		try {
			const q = new URLSearchParams(window.location.search).get("voice");
			if (q && ["listen", "display", "off"].includes(q)) forced = q;
		} catch (e) {
			/* nav window.location — ignorējam */
		}
		const hasApi = typeof window !== "undefined"
			&& !!(window.SpeechRecognition || window.webkitSpeechRecognition);

		let role;
		if (forced === "off") role = "off";
		else if (forced === "listen" || this.config.listen === true) role = "listener";
		else if (forced === "display" || this.config.listen === false) role = "display";
		else role = hasApi ? "listener" : "display"; // "auto"

		if (role === "listener" && !hasApi) {
			Log.warn(`${this.name}: šim pārlūkam nav Web Speech API — pārslēdzos uz "display".`);
			role = "display";
		}
		return role;
	},

	notificationReceived (notification, payload) {
		switch (notification) {
			case "DOM_OBJECTS_CREATED":
				this.ensureOverlay();
				break;
			case "ALL_MODULES_STARTED":
				this.ensureOverlay();
				if (this.config.autoStart && this.role === "listener") {
					setTimeout(() => this.startListening(), this.config.startDelay);
				}
				break;
			case "VOICE_LISTEN_START":
				this.role = "listener";
				this.startListening();
				break;
			case "VOICE_LISTEN_STOP":
				this.stopListening();
				break;
			case "VOICE_ACTIVATE_NOW": // aktivizē manuāli (testam / no cita moduļa)
				this.activate();
				break;
			case "VOICE_SIMULATE": // apstrādā tekstu tā, it kā tas būtu dzirdēts (testam bez mikrofona)
				if (typeof payload === "string") this.process([payload]);
				break;
			default:
				break;
		}
	},

	/* --------- tīkla relejs (node_helper pārraida visiem klientiem) --------- */

	emitNet (kind, data) {
		this.sendSocketNotification(`VC_${kind}`, { origin: this.clientId, ...(data || {}) });
	},

	socketNotificationReceived (notification, payload) {
		if (this.role === "off") return;
		switch (notification) {
			case "VC_ACTIVATED":
				this.remoteActivated(payload);
				break;
			case "VC_DEACTIVATED":
				this.remoteDeactivated(payload);
				break;
			case "VC_COMMAND":
				this.remoteCommand(payload);
				break;
			default:
				break;
		}
	},

	// Aktivācijas vārds dzirdēts (jebkurā klientā) — iedegam malas visur.
	remoteActivated () {
		this.ensureOverlay();
		this.showGlow("listen");
		this.setStatus("Klausos…");
		this.sendNotification("VOICE_ACTIVATED");
		clearTimeout(this.remoteHideTimer);
		this.remoteHideTimer = setTimeout(() => {
			this.hideGlow();
			if (this.status === "Klausos…") this.setStatus("");
		}, this.config.activationTimeout + 1500);
	},

	remoteDeactivated (p) {
		clearTimeout(this.remoteHideTimer);
		this.sendNotification("VOICE_DEACTIVATED");
		if (p && p.timedOut) {
			this.flashGlow("error");
			this.setStatus("Nedzirdēju komandu", 2500);
		} else {
			this.hideGlow();
			if (this.status === "Klausos…") this.setStatus("");
		}
	},

	// Komanda atpazīta — izpilda VISI klienti (TV displejs pārslēdz lapu).
	remoteCommand (p) {
		if (!p || !p.notification) return;
		if (p.id && p.id === this.lastCmdId) return; // dublikāts
		this.lastCmdId = p.id;
		clearTimeout(this.remoteHideTimer);
		clearTimeout(this.commandTimer);
		this.awaitingCommand = false;
		this.cooldownUntil = Date.now() + 1500;

		this.sendNotification(p.notification, p.payload);
		this.sendNotification("VOICE_COMMAND", {
			notification: p.notification,
			payload: p.payload,
			text: p.text
		});
		this.flashGlow("confirm");
		this.setStatus(`✓ ${p.label || p.notification}`, 2500);
		this.updateDom();
	},

	/* ----------------------------- atpazīšana ----------------------------- */

	initRecognition () {
		const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SR) {
			this.supported = false;
			this.setStatus("Web Speech API nav pieejams (jāatver Chromium pārlūkā)", 0);
			Log.error(`${this.name}: SpeechRecognition nav pieejams. Atver MagicMirror īstā Chrome/Chromium pārlūkā, nevis Electron.`);
			this.updateDom();
			return;
		}
		const rec = new SR();
		rec.lang = this.config.lang;
		rec.continuous = true;
		rec.interimResults = true;
		rec.maxAlternatives = 3;
		rec.onresult = (e) => this.handleResult(e);
		rec.onerror = (e) => this.handleError(e);
		rec.onend = () => this.handleEnd();
		rec.onstart = () => {
			this.listening = true;
			this.errorBackoff = 0;
			if (!this.awaitingCommand) this.setStatus("");
			this.updateDom();
		};
		this.recognition = rec;
	},

	startListening () {
		if (this.role !== "listener") return;
		if (!this.supported) return;
		if (!this.recognition) this.initRecognition();
		if (!this.recognition) return;
		this.manuallyStopped = false;
		clearTimeout(this.restartTimer);
		try {
			this.recognition.start();
		} catch (e) {
			// "already started" — nekas slikts.
		}
	},

	stopListening () {
		this.manuallyStopped = true;
		clearTimeout(this.restartTimer);
		if (this.recognition) {
			try {
				this.recognition.stop();
			} catch (e) {
				/* ignore */
			}
		}
		this.deactivate();
		this.setStatus("");
	},

	scheduleRestart () {
		if (this.manuallyStopped || !this.config.autoStart) return;
		clearTimeout(this.restartTimer);
		const delay = this.config.restartDelay + this.errorBackoff;
		this.restartTimer = setTimeout(() => {
			try {
				this.recognition.start();
			} catch (e) {
				this.scheduleRestart();
			}
		}, delay);
	},

	handleEnd () {
		this.listening = false;
		this.updateDom();
		this.scheduleRestart();
	},

	handleError (e) {
		const err = e && e.error ? e.error : "unknown";
		if (this.config.debug) Log.warn(`${this.name}: atpazīšanas kļūda: ${err}`);
		switch (err) {
			case "no-speech":
			case "aborted":
				// normāli — vienkārši restartējam
				break;
			case "not-allowed":
			case "service-not-allowed":
				this.manuallyStopped = true;
				this.supported = false;
				this.setStatus("Nav mikrofona atļaujas", 0);
				this.updateDom();
				Log.error(`${this.name}: mikrofona atļauja liegta. Palaid Chromium ar --use-fake-ui-for-media-stream vai atļauj mikrofonu.`);
				break;
			case "audio-capture":
				this.manuallyStopped = true;
				this.setStatus("Nav atrasts mikrofons", 0);
				this.updateDom();
				Log.error(`${this.name}: nav atrasts mikrofons.`);
				break;
			case "network":
				this.errorBackoff = Math.min((this.errorBackoff || 1000) * 2, 15000);
				this.setStatus("Nav interneta savienojuma", 3000);
				break;
			default:
				this.errorBackoff = Math.min((this.errorBackoff || 500) * 2, 8000);
				break;
		}
	},

	handleResult (e) {
		const candidates = [];
		let interim = "";
		for (let i = e.resultIndex; i < e.results.length; i++) {
			const r = e.results[i];
			if (r.isFinal) {
				for (let a = 0; a < r.length; a++) candidates.push(r[a].transcript);
			} else {
				interim += ` ${r[0].transcript}`;
			}
		}
		// Pēdējais teikums (galīgais + starprezultāts) — ātrākai aktivācijai.
		// Tikai no `resultIndex`, lai neuzkrātu visu sesijas tekstu.
		let full = "";
		for (let i = e.resultIndex; i < e.results.length; i++) full += ` ${e.results[i][0].transcript}`;
		if (full.trim()) candidates.unshift(full.trim());
		if (interim.trim()) candidates.push(interim.trim());

		this.lastTranscript = (candidates[0] || "").trim();
		if (this.config.debug && this.lastTranscript) {
			Log.log(`${this.name}: dzirdēts: "${this.lastTranscript}"`);
		}
		this.process(candidates);
		if (this.config.debug) this.updateDom();
	},

	/* ------------------------- komandu apstrāde ------------------------- */

	process (candidates) {
		const now = Date.now();
		if (now < this.cooldownUntil) return;

		if (!this.awaitingCommand) {
			for (const c of candidates) {
				const words = this.normalize(c).split(" ").filter(Boolean);
				const m = this.matchActivation(words);
				if (!m.matched) continue;
				this.activate();
				if (this.config.sameUtteranceCommand && m.rest) {
					const cmd = this.matchCommand(m.rest);
					if (cmd) this.runCommand(cmd, m.rest);
				}
				return;
			}
			return;
		}

		for (const c of candidates) {
			const restNorm = this.normalize(c);
			const cmd = this.matchCommand(restNorm);
			if (cmd) {
				this.runCommand(cmd, restNorm);
				return;
			}
		}
	},

	// Aktivācijas vārds dzirdēts šajā (listener) klientā. Vietējais stāvoklis
	// vajadzīgs komandu gaidīšanai; malu mirdzumu visos klientos iededz relejs.
	activate () {
		if (this.awaitingCommand) {
			this.armCommandTimer(); // jau aktīvs — tikai pagarinām logu
			return;
		}
		this.awaitingCommand = true;
		this.armCommandTimer();
		this.emitNet("ACTIVATED");
		this.updateDom();
	},

	armCommandTimer () {
		clearTimeout(this.commandTimer);
		this.commandTimer = setTimeout(() => {
			this.emitNet("DEACTIVATED", { timedOut: true });
			this.deactivate();
		}, this.config.activationTimeout);
	},

	deactivate () {
		this.awaitingCommand = false;
		clearTimeout(this.commandTimer);
		this.updateDom();
	},

	runCommand (cmd, matchedText) {
		clearTimeout(this.commandTimer);
		this.awaitingCommand = false;
		this.cooldownUntil = Date.now() + 1500;

		Log.info(`${this.name}: atpazīts "${matchedText}" -> ${cmd.notification} ${cmd.payload ?? ""}`);
		// Izpildi + mirdzumu visos klientos veic relejs (VC_COMMAND atbalss).
		this.emitNet("COMMAND", {
			notification: cmd.notification,
			payload: cmd.payload,
			text: matchedText,
			label: cmd.label || null
		});
	},

	/* --------------------------- sakritības --------------------------- */

	matchActivation (words) {
		for (let i = 0; i < words.length; i++) {
			for (const act of this.activationNorm) {
				if (this.wordsMatchAt(words, i, act)) {
					return { matched: true, rest: words.slice(i + act.length).join(" ") };
				}
			}
		}
		return { matched: false, rest: "" };
	},

	wordsMatchAt (words, start, actWords) {
		if (start + actWords.length > words.length) return false;
		for (let j = 0; j < actWords.length; j++) {
			const w = words[start + j];
			const a = actWords[j];
			if (w === a) continue;
			if (this.config.fuzzy && a.length >= 4 && this.levenshtein(w, a) <= 1) continue;
			return false;
		}
		return true;
	},

	// Atgriež komandu ar visspecifiskāko sakritumu: precīzs sakritums pārspēj
	// "fuzzy", garāka frāze (vairāk vārdu) pārspēj īsāku. Tas neļauj īsam vārdam
	// ("ziņas") pārķert garāku frāzi ("nākamā ziņa").
	matchCommand (textNorm) {
		if (!textNorm) return null;
		const words = textNorm.split(" ").filter(Boolean);
		let best = null;
		let bestScore = -1;
		for (const cmd of this.commandsNorm) {
			for (const phrase of cmd.phrasesNorm) {
				const pWords = phrase.split(" ").filter(Boolean);
				let matchRank = 0; // 2 = precīzs, 1 = fuzzy
				if (textNorm.includes(phrase)) matchRank = 2;
				else if (this.config.fuzzy && this.slidingFuzzyMatch(words, pWords)) matchRank = 1;
				if (!matchRank) continue;
				const score = matchRank * 1000 + pWords.length * 20 + phrase.length;
				if (score > bestScore) {
					bestScore = score;
					best = cmd;
				}
			}
		}
		return best;
	},

	// Vai kādā `words` logā (frāzes garumā) katrs vārds sakrīt ar frāzes vārdu
	// ar kopējo Levenšteina attālumu <= fuzzyMaxDistance.
	slidingFuzzyMatch (words, phraseWords) {
		const n = phraseWords.length;
		if (n === 0 || words.length < n) return false;
		for (let i = 0; i + n <= words.length; i++) {
			let dist = 0;
			let ok = true;
			for (let j = 0; j < n; j++) {
				const pw = phraseWords[j];
				const w = words[i + j];
				const d = this.levenshtein(w, pw);
				// Īsus frāzes vārdus (< 4 burti) prasām precīzi — citādi "ziņas"
				// nejauši sakristu ar "ziņa" u.tml.
				if (pw.length < 4 && d !== 0) {
					ok = false;
					break;
				}
				dist += d;
				if (dist > this.config.fuzzyMaxDistance) {
					ok = false;
					break;
				}
			}
			if (ok) return true;
		}
		return false;
	},

	normalize (str) {
		return (str || "")
			.toLowerCase()
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "") // noņem diakritiku (ā->a, š->s, ...)
			.replace(/[^\p{L}\p{N}\s]/gu, " ")
			.replace(/\s+/g, " ")
			.trim();
	},

	levenshtein (a, b) {
		if (a === b) return 0;
		if (!a.length) return b.length;
		if (!b.length) return a.length;
		let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
		for (let i = 1; i <= a.length; i++) {
			let cur = [i];
			for (let j = 1; j <= b.length; j++) {
				const cost = a[i - 1] === b[j - 1] ? 0 : 1;
				cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
			}
			prev = cur;
		}
		return prev[b.length];
	},

	/* --------------------------- malu mirdzums --------------------------- */

	ensureOverlay () {
		if (this.role === "off") return;
		if (!this.config.glow || this.overlay || typeof document === "undefined") return;
		const overlay = document.createElement("div");
		overlay.id = "mmm-voicecommands-overlay";
		for (const edge of this.config.glowEdges) {
			const el = document.createElement("div");
			el.className = `vc-edge vc-${edge}`;
			overlay.appendChild(el);
		}
		document.body.appendChild(overlay);
		this.overlay = overlay;
	},

	showGlow (kind) {
		if (!this.overlay) this.ensureOverlay();
		if (!this.overlay) return;
		this.overlay.style.setProperty("--vc-color", this.glowColor(kind));
		this.overlay.classList.remove("vc-flash");
		this.overlay.classList.add("vc-on");
	},

	flashGlow (kind) {
		if (!this.overlay) this.ensureOverlay();
		if (!this.overlay) return;
		this.overlay.style.setProperty("--vc-color", this.glowColor(kind));
		this.overlay.classList.add("vc-on", "vc-flash");
		clearTimeout(this._flashTimer);
		this._flashTimer = setTimeout(() => {
			this.overlay.classList.remove("vc-flash");
			if (!this.awaitingCommand) this.overlay.classList.remove("vc-on");
			else this.showGlow("listen");
		}, 900);
	},

	hideGlow () {
		if (!this.overlay) return;
		if (this.overlay.classList.contains("vc-flash")) return; // ļaujam mirgojumam pabeigt
		this.overlay.classList.remove("vc-on");
	},

	glowColor (kind) {
		if (kind === "confirm") return this.config.glowConfirmColor;
		if (kind === "error") return this.config.glowErrorColor;
		return this.config.glowListenColor;
	},

	/* ------------------------------ statuss ------------------------------ */

	setStatus (text, autoClearMs) {
		this.status = text;
		this.updateDom();
		clearTimeout(this.statusResetTimer);
		if (autoClearMs && autoClearMs > 0) {
			this.statusResetTimer = setTimeout(() => {
				this.status = "";
				this.updateDom();
			}, autoClearMs);
		}
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "vc-wrapper";
		if (!this.config.showStatus) return wrapper;

		const dot = document.createElement("span");
		dot.className = "vc-dot";
		if (this.awaitingCommand || this.status === "Klausos…") dot.classList.add("awaiting");
		else if (this.listening) dot.classList.add("live");
		wrapper.appendChild(dot);

		if (this.config.debug) {
			const role = document.createElement("span");
			role.className = "vc-role";
			role.textContent = `[${this.role}]`;
			wrapper.appendChild(role);
		}

		const label = document.createElement("span");
		label.className = "vc-text";
		label.textContent = this.status || this.config.idleText || "";
		wrapper.appendChild(label);

		if (this.config.debug && this.lastTranscript) {
			const t = document.createElement("span");
			t.className = "vc-transcript";
			t.textContent = ` „${this.lastTranscript}"`;
			wrapper.appendChild(t);
		}

		if (!label.textContent && !(this.config.debug && this.lastTranscript)) {
			wrapper.classList.add("vc-empty");
		}
		return wrapper;
	}
});
