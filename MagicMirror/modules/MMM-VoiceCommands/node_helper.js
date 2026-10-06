/* MMM-VoiceCommands — node_helper
 *
 * Relejs starp klientiem: klients, kas dzirdēja komandu (piem. MacBook Chrome
 * lomā "listener"), sūta VC_* notifikācijas šurp; serveris tās pārraida VISIEM
 * pieslēgtajiem klientiem, tāpēc Pi TV displejs ("display" loma) izpilda komandu
 * un rāda malu mirdzumu.
 *
 * Dedublē atkārtotus signālus (vairāki klausītāji / atkārtoti atpazīšanas
 * rezultāti par vienu un to pašu izteikumu).
 *
 * Path B — USB mikrofons pie Pi: ja kāds klients ir lomā "server" (config
 * `listen: "server"`), tas atsūta VC_SERVER_START, un šeit tiek palaista lokāla
 * atpazīšana (arecord + whisper.cpp, skat. server-recognizer.js). Katrs
 * atpazītais teksts aiziet visiem klientiem kā VC_TRANSCRIPT, un "server"
 * klients to apstrādā ar to pašu aktivācijas vārda + komandu loģiku.
 */
const path = require("node:path");
const NodeHelper = require("node_helper");
const Log = require("logger");
const { ServerRecognizer } = require("./server-recognizer");

const RELAYED = ["VC_ACTIVATED", "VC_DEACTIVATED", "VC_COMMAND"];

module.exports = NodeHelper.create({
	start () {
		this.recent = new Map(); // dedupe atslēga -> laiks (ms)
		this.recognizer = null;
		this.serverStatus = null;
		Log.info("MMM-VoiceCommands node_helper startēts.");
	},

	stop () {
		if (this.recognizer) this.recognizer.stop();
	},

	// Ko palaist (whisperBin, model, device, …) ņemam no config.js servera pusē,
	// NEVIS no pārlūka ziņas: socket.io var pieslēgties jebkura ierīce tīklā, un
	// tad tā varētu likt Pi palaist jebkuru programmu. No klienta — tikai teksts.
	serverOptions (payload) {
		const modules = (global.config && global.config.modules) || [];
		const entry = modules.find((m) => m && m.module === "MMM-VoiceCommands");
		const server = (entry && entry.config && entry.config.server) || {};
		const options = { ...server };
		const language = payload && payload.language;
		if (typeof language === "string" && /^[a-z]{2,3}$/.test(language)) options.language = language;
		const prompt = payload && payload.prompt;
		if (typeof prompt === "string") options.prompt = prompt.slice(0, 1000);
		return options;
	},

	// Palaiž mikrofonu vienreiz — nākamie "server" klienti (piem. pārlādēta
	// lapa) tikai saņem pašreizējo statusu.
	startServerRecognition (payload) {
		if (this.recognizer) {
			if (this.serverStatus) this.sendSocketNotification("VC_SERVER_STATUS", this.serverStatus);
			return;
		}
		this.recognizer = new ServerRecognizer(this.serverOptions(payload), {
			root: path.resolve(__dirname, "..", ".."),
			log: Log,
			onTranscript: (text) => this.sendSocketNotification("VC_TRANSCRIPT", { text }),
			onStatus: (status) => {
				this.serverStatus = status;
				this.sendSocketNotification("VC_SERVER_STATUS", status);
			}
		});
		if (!this.recognizer.start()) {
			// Nav whisper/modeļa — ļaujam mēģināt vēlreiz pēc MM restarta vai lapas pārlādes.
			this.recognizer = null;
		}
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "VC_SERVER_START") {
			this.startServerRecognition(payload);
			return;
		}
		if (!RELAYED.includes(notification)) return;

		const now = Date.now();
		for (const [k, t] of this.recent) {
			if (now - t > 5000) this.recent.delete(k);
		}

		const key = notification === "VC_COMMAND"
			? `C:${payload?.notification}:${JSON.stringify(payload?.payload ?? null)}`
			: notification;
		const windowMs = notification === "VC_COMMAND" ? 1500 : 900;
		const last = this.recent.get(key);
		if (last && now - last < windowMs) return; // dublikāts — nepārraidām
		this.recent.set(key, now);

		let out = payload;
		if (notification === "VC_COMMAND") {
			out = { ...payload, id: `${now}-${Math.random().toString(36).slice(2, 6)}` };
			Log.info(`MMM-VoiceCommands: ${out.notification} ${out.payload ?? ""} (no ${out.origin || "?"}) -> visiem klientiem`);
		}

		// Pārraida visiem pieslēgtajiem klientiem (arī atpakaļ sūtītājam).
		this.sendSocketNotification(notification, out);
	}
});
