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
 * LOMA "server" (config `listen: "server"`, Path B): mikrofons ir pieslēgts
 * PAŠAM Pi — node_helper ieraksta ar arecord un atpazīst ar whisper.cpp
 * (lokāli, bez interneta; skat. server-recognizer.js). Atpazītais teksts
 * atnāk kā VC_TRANSCRIPT un tiek apstrādāts ar to pašu loģiku kā pārlūkā.
 *
 * Komandas ar `capture: true` paņem pārējo teikumu kā tekstu
 * ("nopirku pienu" -> payload.text = "pienu"). `also` — papildu
 * notifikācijas, ko izpildīt pēc galvenās (piem. lapa + konkrēta diena).
 *
 * Saderīgs ar MMM-Pages notifikāciju API (PAGES_GOTO / PAGES_HOME / ...).
 */
Module.register("MMM-VoiceCommands", {
	defaults: {
		lang: "lv-LV",

		// "auto"  -> klausās, ja pārlūkam ir Web Speech API, citādi tikai displejs
		// true    -> vienmēr klausās (šis klients)
		// false   -> nekad neklausās (tikai displejs)
		// "server" -> mikrofons pie Pi, atpazīšana node_helper'ī (whisper.cpp)
		// URL `?voice=listen` / `?voice=display` / `?voice=server` / `?voice=off` pārspēj šo.
		listen: "auto",

		// Tikai lomai "server" (skat. scripts/whisper/install.sh). Ceļi ar "~"
		// vai relatīvi pret MagicMirror mapi.
		server: {
			device: "default", // ALSA ierīce, piem. "plughw:1,0" (arecord -l)
			whisperBin: "~/whisper.cpp/build/bin/whisper-cli",
			model: "~/whisper.cpp/models/ggml-small-q5_1.bin",
			threads: 4,
			vad: {} // { minRms, startRatio, silenceMs, maxUtteranceMs } — skat. server-recognizer.js
		},
		captureDelay: 1200, // ms klusuma pēc "nopirku …", pirms teksts tiek uzskatīts par pabeigtu

		// Aktivācijas vārds(-i). Var būt viens teksts vai masīvs.
		activation: ["spoguli", "robert"],
		activationTimeout: 8000, // cik ilgi (ms) pēc aktivācijas gaidīt komandu
		// Cik tālu no teikuma sākuma drīkst būt aktivācijas vārds (0 = tikai pirmais
		// vārds, 1 = atļauj arī "hei spoguli"). Citādi "paskaties uz spoguli" sarunā
		// ieslēdz klausīšanos.
		activationMaxPosition: 1,
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
			{ phrases: ["parādi laikapstākļus", "laikapstākļi", "rādi laiku", "laiks"], notification: "PAGES_GOTO", payload: 0, label: "Laikapstākļi", also: [{ notification: "WEEKWEATHER_SHOW_DAY", payload: 0 }] },
			{ phrases: ["rītdienas laikapstākļi", "laikapstākļi rīt", "parādi rītdienas laiku", "kāds laiks būs rīt", "laiks rīt", "rītdienas laiks"], notification: "PAGES_GOTO", payload: 0, label: "Laikapstākļi rīt", also: [{ notification: "WEEKWEATHER_SHOW_DAY", payload: 1 }] },
			{ phrases: ["parādi kalendāru", "rādi kalendāru", "kalendārs"], notification: "PAGES_GOTO", payload: 2, label: "Kalendārs" },
			{ phrases: ["parādi ziņas", "rādi ziņas", "ziņas"], notification: "PAGES_GOTO", payload: 3, label: "Ziņas" },
			{ phrases: ["nākamā ziņa", "nākošā ziņa", "cita ziņa"], notification: "NEWSDETAIL_NEXT", label: "Nākamā ziņa" },
			{ phrases: ["uz sākumu", "sākuma lapa", "sākums", "mājas"], notification: "PAGES_HOME", label: "Sākums" },
			{ phrases: ["nākamā lapa", "nākošā lapa", "uz priekšu"], notification: "PAGES_NEXT", label: "Nākamā lapa" },
			{ phrases: ["iepriekšējā lapa", "iepriekšēja lapa", "atpakaļ"], notification: "PAGES_PREV", label: "Iepriekšējā lapa" },

			// --- Spotify vadība (skat. MMM-SpotifyNowPlaying; prasa Premium + aktīvu ierīci) ---
			{ phrases: ["apturi mūziku", "pauzē mūziku", "pauze"], notification: "SPOTIFY_PAUSE", label: "Mūzika: pauze" },
			{ phrases: ["atskaņo mūziku", "turpini mūziku", "spēlē mūziku"], notification: "SPOTIFY_PLAY", label: "Mūzika: atskaņo" },
			{ phrases: ["nākamā dziesma", "cita dziesma"], notification: "SPOTIFY_NEXT", label: "Nākamā dziesma" },
			{ phrases: ["iepriekšējā dziesma", "iepriekšēja dziesma"], notification: "SPOTIFY_PREV", label: "Iepriekšējā dziesma" },
			{ phrases: ["skaļāk"], notification: "SPOTIFY_VOLUME_UP", label: "Skaļāk" },
			{ phrases: ["klusāk"], notification: "SPOTIFY_VOLUME_DOWN", label: "Klusāk" },
			{ phrases: ["parādi mūziku", "kas skan", "kāda dziesma skan", "mūzika"], notification: "PAGES_GOTO", payload: 4, label: "Mūzika" },

			// --- interneta radio (skat. MMM-Radio) ---
			{ phrases: ["ieslēdz radio", "atskaņo radio", "palaid radio", "radio"], notification: "RADIO_PLAY", label: "Radio" },
			{ phrases: ["izslēdz radio", "apturi radio", "radio pietiek", "beidz"], notification: "RADIO_STOP", label: "Radio izslēgts" },
			{ phrases: ["nākamā stacija", "cita stacija", "nākamais radio"], notification: "RADIO_NEXT", label: "Nākamā stacija" },
			{ phrases: ["iepriekšējā stacija", "iepriekšējais radio"], notification: "RADIO_PREV", label: "Iepriekšējā stacija" },
			{ phrases: ["ieslēdz staciju", "ieslēdz radio staciju"], notification: "RADIO_PLAY_NAMED", capture: true, label: "Radio" },

			// --- treniņi (skat. MMM-Routines; atbild uz spoguļa jautājumu) ---
			{ phrases: ["parādi treniņu", "rādi treniņu", "treniņa lapa"], notification: "PAGES_GOTO", payload: 5, label: "Treniņš" },
			{ phrases: ["treniņš pabeigts", "treniņu pabeidzu", "pabeidzu treniņu", "treniņš izdarīts", "izdarīju treniņu"], notification: "ROUTINES_COMPLETE", label: "Treniņš pabeigts" },
			{ phrases: ["vēl ne", "treniņš nav pabeigts", "treniņš vēl nav"], notification: "ROUTINES_DISMISS", label: "Treniņš vēl nav" },
			{ phrases: ["par vieglu", "pārāk viegls", "bija viegls", "viegls"], notification: "ROUTINES_FEEDBACK", payload: "easy", label: "Treniņš: par vieglu" },
			{ phrases: ["tieši laikā", "tieši labi", "normāli", "vidēji"], notification: "ROUTINES_FEEDBACK", payload: "ok", label: "Treniņš: tieši laikā" },
			{ phrases: ["par grūtu", "pārāk grūts", "bija grūts", "grūts"], notification: "ROUTINES_FEEDBACK", payload: "hard", label: "Treniņš: par grūtu" },

			// --- plānotie notikumi (skat. MMM-CalendarAgenda; dati no Google kalendāra) ---
			{ phrases: ["kas plānots", "kas ieplānots", "parādi plānus", "rādi plānus", "darba kārtība", "plāni"], notification: "PAGES_GOTO", payload: 6, label: "Plānotais" },

			// --- uzdevumi/iepirkumi (skat. MMM-TodoList; spoguļa paša saraksts, telefonā /todo) ---
			{ phrases: ["parādi uzdevumus", "rādi uzdevumus", "uzdevumu saraksts", "uzdevumi", "iepirkumu saraksts", "parādi iepirkumus", "pirkumu saraksts"], notification: "PAGES_GOTO", payload: 7, label: "Uzdevumi" },
			{ phrases: ["uzdevums pabeigts", "uzdevumu pabeidzu", "pabeidzu uzdevumu", "izdarīju uzdevumu"], notification: "TODO_COMPLETE", payload: { list: "tasks" }, label: "Uzdevums pabeigts" },
			{ phrases: ["pirkums nopirkts", "nopirku pirkumu", "atzīmē pirkumu", "pirkums pabeigts"], notification: "TODO_COMPLETE", payload: { list: "shopping" }, label: "Pirkums nopirkts" },
			// Ar nosaukumu: "Spoguli, nopirku pienu" / "Spoguli, izdarīju mājasdarbus".
			{ phrases: ["nopirku", "esmu nopircis", "esmu nopirkusi"], notification: "TODO_COMPLETE", payload: { list: "shopping" }, capture: true, label: "Nopirkts" },
			{ phrases: ["izdarīju", "pabeidzu", "atzīmē kā izdarītu", "atzīmē"], notification: "TODO_COMPLETE", payload: { list: "tasks" }, capture: true, label: "Izdarīts" },
			{ phrases: ["pievieno iepirkumiem", "pievieno iepirkumu sarakstam", "pievieno sarakstam", "pievieno"], notification: "TODO_ADD", payload: { list: "shopping" }, capture: true, label: "Pievienots" },
			{ phrases: ["pievieno uzdevumu", "pievieno uzdevumiem", "jauns uzdevums"], notification: "TODO_ADD", payload: { list: "tasks" }, capture: true, label: "Uzdevums pievienots" },

			// --- pārsteigums (skat. MMM-EasterEggs): "Spoguli, spoguli, saki man tā" ---
			{ phrases: ["saki man tā"], notification: "EASTEREGG_GLITTER", label: "✨" }
		]
	},

	getStyles () {
		return ["font-awesome.css", "MMM-VoiceCommands.css"];
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
		this.statusIcon = null;
		this.lastTranscript = "";
		this.lastCmdId = null;
		this.overlay = null;
		this.pendingCapture = null; // { cmd, text, rest } — "nopirku …", gaida teikuma beigas
		this.captureTimer = null;

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
			if (q && ["listen", "display", "server", "off"].includes(q)) forced = q;
		} catch (e) {
			/* nav window.location — ignorējam */
		}
		const hasApi = typeof window !== "undefined"
			&& !!(window.SpeechRecognition || window.webkitSpeechRecognition);

		let role;
		if (forced === "off") role = "off";
		else if (forced === "server" || (!forced && this.config.listen === "server")) role = "server";
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
				if (this.role === "server") this.startServer();
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
			case "VC_TRANSCRIPT": // Pi mikrofons (whisper.cpp) kaut ko sadzirdēja
				if (this.role !== "server" || !payload || !payload.text) break;
				this.lastTranscript = payload.text;
				this.process([payload.text]);
				if (this.config.debug) this.updateDom();
				break;
			case "VC_SERVER_STATUS":
				if (this.role !== "server" || !payload) break;
				this.listening = !!payload.ok;
				// Kļūda paliek redzama (ne tikai 8 s), citādi nav saprotams, kāpēc spogulis nereaģē.
				if (payload.ok) this.setStatus("");
				else this.setStatus(`Balss: ${payload.message}`, 0, "fa-microphone-slash");
				break;
			default:
				break;
		}
	},

	// Loma "server": palūdz node_helper palaist Pi mikrofonu + whisper.cpp.
	// Uzvedne (prompt) ar mūsu frāzēm stipri uzlabo whisper precizitāti
	// latviešu valodā — tas "zina", kādus vārdus sagaidīt.
	startServer () {
		const lang = String(this.config.lang || "lv").split("-")[0];
		this.sendSocketNotification("VC_SERVER_START", {
			...this.config.server,
			language: lang,
			prompt: this.buildWhisperPrompt()
		});
	},

	// Tikai komandu vārdnīca, BEZ aktivācijas vārda. Agrāk uzvedne bija
	// "Spoguli, parādi …. Spoguli, parādi …." — uz neskaidra audio (mūzika,
	// vairāki runātāji) whisper var turpināt uzvednes rakstu un izdomāt
	// "Spoguli, …". "Spoguli" ir parasts vārds, to whisper atpazīst arī bez uzvednes.
	buildWhisperPrompt () {
		const phrases = (this.config.commands || []).map((c) => (c.phrases || [])[0]).filter(Boolean);
		let prompt = "";
		for (const p of phrases) {
			const next = prompt ? `${prompt}, ${p}` : p;
			if (next.length > 600) break; // whisper uzvednei ir ~224 tokenu limits
			prompt = next;
		}
		return prompt ? `${prompt[0].toUpperCase()}${prompt.slice(1)}.` : "";
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
		for (const extra of p.also || []) {
			if (extra && extra.notification) this.sendNotification(extra.notification, extra.payload);
		}
		this.sendNotification("VOICE_COMMAND", {
			notification: p.notification,
			payload: p.payload,
			text: p.text
		});
		this.flashGlow("confirm");
		this.setStatus(p.label || p.notification, 2500, "fa-check");
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
		let final = false;
		for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) final = true;
		this.process(candidates, { final });
		if (this.config.debug) this.updateDom();
	},

	/* ------------------------- komandu apstrāde ------------------------- */

	// `final: false` — pārlūka starprezultāts (teikums vēl turpinās). Tad
	// komandas ar `capture` vēl neizpildām, lai "nopirku pi…" nekļūtu par "pi".
	process (candidates, { final = true } = {}) {
		const now = Date.now();
		if (now < this.cooldownUntil) return;

		if (!this.awaitingCommand) {
			for (const c of candidates) {
				const tokens = this.tokenize(c);
				const m = this.matchActivation(tokens.map((t) => this.normalize(t)));
				if (!m.matched) continue;
				const found = this.config.sameUtteranceCommand && m.rest
					? this.findCommand(m.rest, tokens.slice(m.restIndex).join(" "))
					: null;
				// Tikai līdzīgs vārds ("spogulis", whisper kļūda) pats par sevi neaktivizē —
				// tad tam jāseko komandai. Citādi saruna par spoguli ieslēdz klausīšanos.
				if (!m.exact && !found) continue;
				this.activate();
				if (found) this.handleFound(found, m.rest, final);
				return;
			}
			return;
		}

		for (const c of candidates) {
			const restNorm = this.normalize(c);
			const found = this.findCommand(restNorm, this.tokenize(c).join(" "));
			if (found) {
				this.handleFound(found, restNorm, final);
				return;
			}
		}
	},

	handleFound (found, text, final) {
		if (!found.cmd.capture || final) {
			this.clearPendingCapture();
			this.runCommand(found.cmd, text, found.rest);
			return;
		}
		// Teikums vēl nav pabeigts — gaidām galīgo rezultātu vai īsu klusumu.
		this.pendingCapture = { cmd: found.cmd, text, rest: found.rest };
		clearTimeout(this.captureTimer);
		this.captureTimer = setTimeout(() => {
			const p = this.pendingCapture;
			this.pendingCapture = null;
			if (p) this.runCommand(p.cmd, p.text, p.rest);
		}, this.config.captureDelay);
	},

	clearPendingCapture () {
		clearTimeout(this.captureTimer);
		this.pendingCapture = null;
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

	runCommand (cmd, matchedText, captured) {
		clearTimeout(this.commandTimer);
		this.awaitingCommand = false;
		this.cooldownUntil = Date.now() + 1500;

		let payload = cmd.payload;
		let label = cmd.label || null;
		if (cmd.capture) {
			payload = { ...(cmd.payload && typeof cmd.payload === "object" ? cmd.payload : {}), text: captured || "" };
			if (captured) label = `${label || cmd.notification}: ${captured}`;
		}

		Log.info(`${this.name}: atpazīts "${matchedText}" -> ${cmd.notification} ${JSON.stringify(payload ?? "")}`);
		// Izpildi + mirdzumu visos klientos veic relejs (VC_COMMAND atbalss).
		this.emitNet("COMMAND", {
			notification: cmd.notification,
			payload,
			also: Array.isArray(cmd.also) ? cmd.also : undefined,
			text: matchedText,
			label
		});
	},

	/* --------------------------- sakritības --------------------------- */

	// Aktivācijas vārds jāpasaka teikuma sākumā (skat. activationMaxPosition).
	// `exact: false` — sakrita tikai ar vienas burta pielaidi (fuzzy).
	matchActivation (words) {
		const maxStart = Math.min(words.length - 1, this.config.activationMaxPosition ?? Infinity);
		let fuzzyHit = null;
		for (let i = 0; i <= maxStart; i++) {
			for (const act of this.activationNorm) {
				const how = this.wordsMatchAt(words, i, act);
				if (!how) continue;
				const hit = { matched: true, exact: how === "exact", rest: words.slice(i + act.length).join(" "), restIndex: i + act.length };
				if (hit.exact) return hit;
				fuzzyHit = fuzzyHit || hit;
			}
		}
		return fuzzyHit || { matched: false, exact: false, rest: "", restIndex: -1 };
	},

	// "exact" | "fuzzy" | false
	wordsMatchAt (words, start, actWords) {
		if (start + actWords.length > words.length) return false;
		let how = "exact";
		for (let j = 0; j < actWords.length; j++) {
			const w = words[start + j];
			const a = actWords[j];
			if (w === a) continue;
			if (this.config.fuzzy && a.length >= 4 && this.levenshtein(w, a) <= 1) {
				how = "fuzzy";
				continue;
			}
			return false;
		}
		return how;
	},

	// Atgriež komandu ar visspecifiskāko sakritumu: precīzs sakritums pārspēj
	// "fuzzy", garāka frāze (vairāk vārdu) pārspēj īsāku. Tas neļauj īsam vārdam
	// ("ziņas") pārķert garāku frāzi ("nākamā ziņa").
	matchCommand (textNorm) {
		const found = this.findCommand(textNorm);
		return found ? found.cmd : null;
	},

	// Kā matchCommand, bet atgriež arī tekstu PĒC frāzes (komandām ar
	// `capture`). `original` — tas pats teikums ar garumzīmēm (tokenize),
	// lai sarakstā būtu "ābolus", nevis "abolus".
	findCommand (textNorm, original) {
		if (!textNorm) return null;
		const words = textNorm.split(" ").filter(Boolean);
		const origWords = original ? original.split(" ").filter(Boolean) : words;
		const aligned = origWords.length === words.length;
		let best = null;
		let bestScore = -1;
		for (const cmd of this.commandsNorm) {
			for (const phrase of cmd.phrasesNorm) {
				const pWords = phrase.split(" ").filter(Boolean);
				let matchRank = 0; // 2 = precīzs, 1 = fuzzy
				let at = this.indexOfWords(words, pWords);
				if (at >= 0 || textNorm.includes(phrase)) matchRank = 2;
				else if (this.config.fuzzy) {
					at = this.slidingFuzzyIndex(words, pWords);
					if (at >= 0) matchRank = 1;
				}
				if (!matchRank) continue;
				let rest = "";
				if (cmd.capture) {
					// Vajag tekstu pēc frāzes — bez tā ("nopirku") tā nav šī komanda.
					if (at < 0) continue;
					rest = (aligned ? origWords : words).slice(at + pWords.length).join(" ");
					if (!rest) continue;
				}
				const score = matchRank * 1000 + pWords.length * 20 + phrase.length;
				if (score > bestScore) {
					bestScore = score;
					best = { cmd, rest };
				}
			}
		}
		return best;
	},

	indexOfWords (words, pWords) {
		const n = pWords.length;
		for (let i = 0; n && i + n <= words.length; i++) {
			let ok = true;
			for (let j = 0; j < n && ok; j++) ok = words[i + j] === pWords[j];
			if (ok) return i;
		}
		return -1;
	},

	// Vai kādā `words` logā (frāzes garumā) katrs vārds sakrīt ar frāzes vārdu
	// ar kopējo Levenšteina attālumu <= fuzzyMaxDistance.
	slidingFuzzyMatch (words, phraseWords) {
		return this.slidingFuzzyIndex(words, phraseWords) >= 0;
	},

	slidingFuzzyIndex (words, phraseWords) {
		const n = phraseWords.length;
		if (n === 0 || words.length < n) return -1;
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
			if (ok) return i;
		}
		return -1;
	},

	// Vārdi ar saglabātām garumzīmēm, bet bez pieturzīmēm — vārdu skaits un
	// secība sakrīt ar normalize() rezultātu (tas tikai noņem diakritiku).
	tokenize (str) {
		return String(str || "")
			.toLowerCase()
			.normalize("NFC")
			.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
			.split(/\s+/)
			.filter((w) => w && this.normalize(w));
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

	setStatus (text, autoClearMs, icon) {
		this.status = text;
		this.statusIcon = icon || null;
		this.updateDom();
		clearTimeout(this.statusResetTimer);
		if (autoClearMs && autoClearMs > 0) {
			this.statusResetTimer = setTimeout(() => {
				this.status = "";
				this.statusIcon = null;
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

		if (this.status && this.statusIcon) {
			const statusIconEl = document.createElement("i");
			statusIconEl.className = `fa-solid ${this.statusIcon} vc-status-icon`;
			wrapper.appendChild(statusIconEl);
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
