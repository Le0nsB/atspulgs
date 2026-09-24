/* node_helper priekš MMM-GoogleCalendar
 *
 * Google konta pieslēgšana ar OAuth 2.0 "device authorization" plūsmu —
 * TĀ PATI, ko izmanto YouTube/Netflix uz TV: uz ekrāna parādās kods un
 * adrese (google.com/device), lietotājs to ievada SAVĀ tālrunī/datorā, un
 * spogulis automātiski saņem piekļuvi, tiklīdz lietotājs to apstiprina.
 * Nav vajadzīga sarežģīta "Sign in with Google" poga ar HTTPS callback —
 * tas uz spoguļa (LAN, bez publiska domēna) nebūtu vienkārši realizējams.
 *
 * Vajadzīgs OAuth klients (Client ID + Client secret), ko VIENREIZ
 * izveido "administrators" Google Cloud Console (tips "TV and Limited
 * Input devices") — skat. README.md. Tas glabājas MagicMirror/secrets.js
 * (servera pusē), tāpat kā Spotify/Todoist atslēgas.
 *
 * Pēc lietotāja apstiprinājuma saņemtais refresh token tiek saglabāts
 * lokāli šī moduļa mapē (`token.json`, skat. .gitignore) — tas AIZVIETO
 * secrets.js ierakstu, jo tas nav uzstādīšanas laika konstante, bet gan
 * dinamiski iegūts piekļuves dokuments, ko var jebkurā brīdī atsaukt un
 * atkārtoti pieslēgties no jauna.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");
const fs = require("node:fs");
const path = require("node:path");

function loadOAuthClient () {
	const root = path.resolve(__dirname, "..", "..");
	const candidates = [path.join(root, "secrets.js"), path.join(root, "config", "secrets.js")];
	for (const file of candidates) {
		if (!fs.existsSync(file)) continue;
		if (file.includes(`${path.sep}config${path.sep}`)) {
			Log.warn(`MMM-GoogleCalendar: ${file} ir lejupielādējams no tīkla (http://<ip>:8080/config/secrets.js) — pārvieto to uz ${candidates[0]}`);
		}
		try {
			const { oauthClientId, oauthClientSecret } = require(file).google || {};
			return oauthClientId && oauthClientSecret ? { clientId: oauthClientId, clientSecret: oauthClientSecret } : null;
		} catch (error) {
			Log.error(`MMM-GoogleCalendar: neizdevās ielasīt ${file}: ${error.message}`);
			return null;
		}
	}
	return null;
}

const DEVICE_CODE_URL = "https://oauth2.googleapis.com/device/code";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = NodeHelper.create({
	start () {
		this.config = null;
		this.clientId = null;
		this.clientSecret = null;
		this.refreshToken = null;
		this.accessToken = null;
		this.accessTokenExpiry = 0;
		this.timer = null;
		this.failures = 0;
		this.pairing = null; // { deviceCode, interval, expiresAt, timer }
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "GCAL_CONFIG") return;
		const client = loadOAuthClient();
		if (!client) {
			this.sendSocketNotification("GCAL_NO_CLIENT");
			return;
		}
		this.config = payload;
		this.clientId = client.clientId;
		this.clientSecret = client.clientSecret;
		this.loadToken();
		this.failures = 0;
		if (this.refreshToken) {
			this.poll();
		} else {
			this.beginPairing();
		}
	},

	/* ------------------------------ token.json ------------------------------ */

	tokenFile () {
		return path.join(__dirname, "token.json");
	},

	loadToken () {
		try {
			const data = JSON.parse(fs.readFileSync(this.tokenFile(), "utf8"));
			this.refreshToken = data.refreshToken || null;
		} catch (err) {
			this.refreshToken = null;
		}
	},

	saveToken () {
		try {
			fs.writeFileSync(this.tokenFile(), JSON.stringify({ refreshToken: this.refreshToken }, null, "\t"));
		} catch (err) {
			Log.error(`[MMM-GoogleCalendar] neizdevās saglabāt token.json: ${err.message}`);
		}
	},

	clearToken () {
		this.refreshToken = null;
		this.accessToken = null;
		this.accessTokenExpiry = 0;
		try {
			fs.unlinkSync(this.tokenFile());
		} catch (err) {
			// nav vai jau dzēsts — nekas nav jādara
		}
	},

	/* ------------------------ device authorization plūsma ------------------------ */

	async beginPairing () {
		try {
			const body = new URLSearchParams({ client_id: this.clientId, scope: SCOPE });
			const res = await fetch(DEVICE_CODE_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body
			});
			if (!res.ok) throw new Error(`device/code ${res.status}: ${await res.text()}`);
			const data = await res.json();
			this.pairing = {
				deviceCode: data.device_code,
				interval: Math.max(5, data.interval || 5) * 1000,
				expiresAt: Date.now() + (data.expires_in || 1800) * 1000,
				timer: null
			};
			this.sendSocketNotification("GCAL_PAIRING_CODE", {
				userCode: data.user_code,
				verificationUrl: data.verification_url || data.verification_uri,
				expiresAt: this.pairing.expiresAt
			});
			Log.info(`[MMM-GoogleCalendar] gaida pieslēgšanos: ${data.verification_url || data.verification_uri} kods ${data.user_code}`);
			this.schedulePairingPoll();
		} catch (err) {
			this.pairing = null;
			Log.error(`[MMM-GoogleCalendar] neizdevās sākt Google pieslēgšanu: ${err.message}`);
			this.sendSocketNotification("GCAL_PAIRING_ERROR", err.message);
		}
	},

	schedulePairingPoll () {
		if (!this.pairing) return;
		clearTimeout(this.pairing.timer);
		this.pairing.timer = setTimeout(() => this.pollPairing(), this.pairing.interval);
	},

	async pollPairing () {
		if (!this.pairing) return;
		if (Date.now() > this.pairing.expiresAt) {
			this.pairing = null;
			this.beginPairing(); // kods nobeidzies — ģenerē jaunu, lai lietotājam nav jāsāk pats
			return;
		}
		try {
			const body = new URLSearchParams({
				client_id: this.clientId,
				client_secret: this.clientSecret,
				device_code: this.pairing.deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code"
			});
			const res = await fetch(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body
			});
			const data = await res.json();

			if (res.ok) {
				this.refreshToken = data.refresh_token;
				this.accessToken = data.access_token;
				this.accessTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
				this.saveToken();
				this.pairing = null;
				this.sendSocketNotification("GCAL_PAIRING_DONE");
				Log.info("[MMM-GoogleCalendar] pieslēgts — sāku ielādēt notikumus");
				this.failures = 0;
				this.poll();
				return;
			}

			if (data.error === "authorization_pending") {
				this.schedulePairingPoll();
				return;
			}
			if (data.error === "slow_down") {
				this.pairing.interval += 5000;
				this.schedulePairingPoll();
				return;
			}
			if (data.error === "expired_token") {
				this.pairing = null;
				this.beginPairing();
				return;
			}

			// access_denied vai cita galīga kļūda — lietotājam jāsāk no jauna pats
			// (parāda kļūdu; jauns kods parādīsies, kad modulis atkārtoti startēs).
			this.pairing = null;
			this.sendSocketNotification("GCAL_PAIRING_ERROR", data.error || `token ${res.status}`);
		} catch (err) {
			Log.warn(`[MMM-GoogleCalendar] pairing poll kļūda: ${err.message}`);
			this.schedulePairingPoll();
		}
	},

	/* ------------------------------ kalendāra dati ------------------------------ */

	scheduleNext () {
		if (!this.config || !this.refreshToken) return;
		clearTimeout(this.timer);
		const base = Math.max(5 * 60 * 1000, this.config.updateInterval);
		const delay = this.failures > 0
			? Math.min(base * 2 ** Math.min(this.failures, 5), 30 * 60 * 1000)
			: base;
		this.timer = setTimeout(() => this.poll(), delay);
	},

	async getAccessToken () {
		if (this.accessToken && Date.now() < this.accessTokenExpiry - 5000) return this.accessToken;
		const body = new URLSearchParams({
			client_id: this.clientId,
			client_secret: this.clientSecret,
			refresh_token: this.refreshToken,
			grant_type: "refresh_token"
		});
		const res = await fetch(TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body
		});
		if (!res.ok) {
			const text = await res.text();
			if (res.status === 400 || res.status === 401) {
				// Refresh token atsaukts/nederīgs (piem. lietotājs to atsauca Google
				// kontā) — dzēšam un sākam pieslēgšanu no jauna, lai spogulis pats
				// atgūstas bez administratora iejaukšanās.
				this.clearToken();
				this.beginPairing();
			}
			throw new Error(`token refresh ${res.status}: ${text}`);
		}
		const data = await res.json();
		this.accessToken = data.access_token;
		this.accessTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
		return this.accessToken;
	},

	async poll () {
		if (!this.refreshToken) return;
		try {
			const token = await this.getAccessToken();
			const params = new URLSearchParams({
				timeMin: new Date(Date.now() - DAY_MS).toISOString(),
				timeMax: new Date(Date.now() + this.config.maximumNumberOfDays * DAY_MS).toISOString(),
				singleEvents: "true",
				orderBy: "startTime",
				maxResults: "250"
			});
			const res = await fetch(`${EVENTS_URL}?${params.toString()}`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			if (!res.ok) throw new Error(`events ${res.status}: ${await res.text()}`);
			const data = await res.json();
			const events = (data.items || []).map((item) => this.normalize(item)).filter(Boolean);
			Log.info(`[MMM-GoogleCalendar] ielādēti ${events.length} notikumi (no ${(data.items || []).length} API atbildē)`);
			this.failures = 0;
			this.sendSocketNotification("GCAL_DATA", events);
		} catch (err) {
			this.failures += 1;
			Log.error(`[MMM-GoogleCalendar] ${err.message} (kļūda #${this.failures})`);
			this.sendSocketNotification("GCAL_ERROR", err.message);
		} finally {
			this.scheduleNext();
		}
	},

	// Google Calendar API (ar singleEvents=true) jau pats izvērš atkārtotos
	// notikumus, tāpēc šeit vajadzīga tikai lauku pārsaukšana/formāta maiņa.
	normalize (item) {
		const start = item.start && (item.start.dateTime || item.start.date);
		if (!start) return null;
		const end = item.end && (item.end.dateTime || item.end.date);
		const fullDayEvent = !!(item.start.date && !item.start.dateTime);
		return {
			title: item.summary || "",
			startDate: new Date(start).getTime(),
			endDate: end ? new Date(end).getTime() : new Date(start).getTime(),
			fullDayEvent
		};
	}
});
