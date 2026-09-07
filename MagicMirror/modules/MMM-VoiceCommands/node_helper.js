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
 * NĀKOTNĒ (Path B — USB mikrofons Pi): šeit varēs pievienot lokālu atpazīšanu
 * (arecord + whisper.cpp) un padot tekstu tai pašai sakritības loģikai.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");

const RELAYED = ["VC_ACTIVATED", "VC_DEACTIVATED", "VC_COMMAND"];

module.exports = NodeHelper.create({
	start () {
		this.recent = new Map(); // dedupe atslēga -> laiks (ms)
		Log.info("MMM-VoiceCommands node_helper startēts.");
	},

	socketNotificationReceived (notification, payload) {
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
