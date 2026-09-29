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
 * (servera pusē), tāpat kā Spotify atslēgas.
 *
 * Pēc lietotāja apstiprinājuma saņemtais refresh token tiek saglabāts
 * `MagicMirror/data/google-token.json` (tikai īpašniekam lasāms). NE šī
 * moduļa mapē: MagicMirror visu `modules/` atdod pa HTTP, tāpēc no turienes
 * to varētu lejupielādēt jebkurš tīklā. Tas nav secrets.js ieraksts, jo tas
 * nav uzstādīšanas laika konstante, bet gan dinamiski iegūts piekļuves
 * dokuments, ko var jebkurā brīdī atsaukt un atkārtoti pieslēgties no jauna.
 *
 * Telefona lapa http://<pi-ip>:8080/calendar ļauj pievienot notikumus (un dzēst
 * tos, kas pievienoti no spoguļa) — skat. registerRoutes().
 *
 * Papildus Google var pievienot jebkuru ICS kalendāru (Outlook / Microsoft 365
 * "Publicēt kalendāru", iCloud u.c.) — secrets.js `calendarFeeds`. Tie tiek
 * apvienoti ar Google notikumiem, tāpēc parādās visur, kur Google notikumi
 * (dienas plāns, mēneša kalendārs, atgādinājumi). ICS saite satur slepenu
 * atslēgu, tāpēc tā glabājas secrets.js, ne config.js.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const ical = require("node-ical");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "data");
const TOKEN_FILE = path.join(DATA_DIR, "google-token.json");
const LEGACY_TOKEN_FILE = path.join(__dirname, "token.json");

// QR kods telefona lapai — bibliotēka jau ir MMM-Remote-Control atkarībās.
// Ja tās nav, spogulis rāda tikai adresi.
function loadQrCode () {
	for (const id of ["qrcode", path.join(ROOT, "modules", "MMM-Remote-Control", "node_modules", "qrcode")]) {
		try {
			return require(id);
		} catch (error) {
			// mēģina nākamo
		}
	}
	return null;
}

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

// ICS kalendāri (piem. Outlook) no secrets.js:
//   calendarFeeds: [{ name: "Outlook", url: "https://outlook.office365.com/owa/calendar/…/calendar.ics" }]
function normalizeFeeds (feeds) {
	return (Array.isArray(feeds) ? feeds : [])
		.filter((f) => f && typeof f.url === "string" && f.url.trim())
		.map((f, i) => ({ name: String(f.name || `Kalendārs ${i + 1}`), url: f.url.trim().replace(/^webcal:\/\//i, "https://") }));
}

function loadCalendarFeeds () {
	const file = path.join(ROOT, "secrets.js");
	if (!fs.existsSync(file)) return [];
	try {
		return normalizeFeeds(require(file).calendarFeeds);
	} catch (error) {
		Log.error(`MMM-GoogleCalendar: neizdevās ielasīt calendarFeeds no ${file}: ${error.message}`);
		return [];
	}
}

// ICS teksts -> tie paši notikumu objekti, ko dod normalize() Google notikumiem.
// Atkārtotos notikumus (RRULE, arī Outlook "katru otrdienu") izvērš node-ical.
function parseIcsEvents (text, feedName, from, to) {
	const data = ical.sync.parseICS(text);
	const out = [];
	for (const item of Object.values(data)) {
		if (!item || item.type !== "VEVENT" || !item.start) continue;
		if (item.status === "CANCELLED") continue;
		let instances;
		try {
			instances = ical.expandRecurringEvent(item, { from, to, expandOngoing: true });
		} catch (err) {
			continue; // bojāts RRULE — izlaižam tikai šo notikumu
		}
		for (const inst of instances) {
			const start = inst.start.getTime();
			let end = inst.end ? inst.end.getTime() : start;
			if (inst.isFullDay && end <= start) end = start + DAY_MS;
			const summary = typeof inst.summary === "object" && inst.summary ? inst.summary.val : inst.summary;
			out.push({
				id: `ics-${feedName}-${item.uid || summary}-${start}`,
				fromMirror: false,
				source: feedName,
				title: String(summary || ""),
				startDate: start,
				endDate: end,
				fullDayEvent: Boolean(inst.isFullDay)
			});
		}
	}
	return out;
}

const DEVICE_CODE_URL = "https://oauth2.googleapis.com/device/code";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
// Pilnā "calendar" atļauja, jo device flow NEatļauj šaurāko calendar.events
// (Google atbild invalid_scope), bet notikumu pievienošanai vajag rakstīt.
const SCOPE = "https://www.googleapis.com/auth/calendar";
// Ar šo atzīmē no spoguļa pievienotos notikumus — tikai tos drīkst dzēst no telefona lapas.
const MIRROR_TAG = "magicmirror";
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
		this.lastSent = null; // pēdējie nosūtītie notikumi (JSON), lai nesūtītu tos pašus atkārtoti
		this.grantedScopes = [];
		this.events = []; // Google + ICS kopā (tas, ko redz spogulis)
		this.googleEvents = [];
		this.icsEvents = [];
		this.feeds = [];
		this.icsTimer = null;
		this.icsFailures = 0;
		this.pairingInfo = null; // tas pats, kas GCAL_PAIRING_CODE — telefona lapai
		this.status = "starting"; // starting | no_client | pairing | connected
		this.registerRoutes();
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "GCAL_CONFIG") return;
		const client = loadOAuthClient();
		this.sendPhoneLink();
		this.feeds = this.loadFeeds();
		if (!client && !this.feeds.length) {
			this.status = "no_client";
			this.sendSocketNotification("GCAL_NO_CLIENT");
			return;
		}
		this.config = payload;
		this.lastSent = null; // pārlūks (pār)startējis — nākamie dati jāsūta obligāti
		if (this.feeds.length) this.pollIcs();
		if (!client) {
			// Tikai ICS (piem. tikai Outlook) arī ir derīgs iestatījums.
			this.status = "no_client";
			return;
		}
		this.clientId = client.clientId;
		this.clientSecret = client.clientSecret;
		this.loadToken();
		this.failures = 0;
		if (this.refreshToken) {
			this.status = "connected";
			this.poll();
		} else if (!this.pairing) {
			this.beginPairing();
		} else if (this.pairingInfo) {
			this.sendSocketNotification("GCAL_PAIRING_CODE", this.pairingInfo);
		}
	},

	loadFeeds () {
		return loadCalendarFeeds();
	},

	/* ------------------------------ tokena fails ------------------------------ */

	loadToken () {
		this.migrateLegacyToken();
		try {
			const data = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
			this.refreshToken = data.refreshToken || null;
			// Vecajiem tokeniem (pirms notikumu pievienošanas) scope nav saglabāts — tie ir readonly.
			this.grantedScopes = String(data.scope || "").split(" ").filter(Boolean);
		} catch (err) {
			this.refreshToken = null;
			this.grantedScopes = [];
		}
	},

	// Agrāk token.json glabājās moduļa mapē, kas ir pieejama pa HTTP — pārvieto uz data/.
	migrateLegacyToken () {
		if (!fs.existsSync(LEGACY_TOKEN_FILE)) return;
		try {
			if (fs.existsSync(TOKEN_FILE)) {
				fs.unlinkSync(LEGACY_TOKEN_FILE);
			} else {
				fs.mkdirSync(DATA_DIR, { recursive: true });
				fs.renameSync(LEGACY_TOKEN_FILE, TOKEN_FILE);
				fs.chmodSync(TOKEN_FILE, 0o600);
				Log.info(`[MMM-GoogleCalendar] token.json pārvietots uz ${TOKEN_FILE}`);
			}
		} catch (err) {
			Log.error(`[MMM-GoogleCalendar] neizdevās pārvietot token.json: ${err.message}`);
		}
	},

	saveToken () {
		try {
			fs.mkdirSync(DATA_DIR, { recursive: true });
			const data = { refreshToken: this.refreshToken, scope: this.grantedScopes.join(" ") };
			fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, "\t"), { mode: 0o600 });
		} catch (err) {
			Log.error(`[MMM-GoogleCalendar] neizdevās saglabāt ${TOKEN_FILE}: ${err.message}`);
		}
	},

	clearToken () {
		this.refreshToken = null;
		this.accessToken = null;
		this.accessTokenExpiry = 0;
		this.grantedScopes = [];
		try {
			fs.unlinkSync(TOKEN_FILE);
		} catch (err) {
			// nav vai jau dzēsts — nekas nav jādara
		}
	},

	canWrite () {
		return this.grantedScopes.includes(SCOPE);
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
			if (this.pairing) clearTimeout(this.pairing.timer);
			this.status = "pairing";
			this.pairing = {
				deviceCode: data.device_code,
				interval: Math.max(5, data.interval || 5) * 1000,
				expiresAt: Date.now() + (data.expires_in || 1800) * 1000,
				timer: null
			};
			this.pairingInfo = {
				userCode: data.user_code,
				verificationUrl: data.verification_url || data.verification_uri,
				expiresAt: this.pairing.expiresAt
			};
			this.sendSocketNotification("GCAL_PAIRING_CODE", this.pairingInfo);
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
				this.grantedScopes = String(data.scope || "").split(" ").filter(Boolean);
				this.saveToken();
				this.pairing = null;
				this.pairingInfo = null;
				this.status = "connected";
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
		const base = Math.max(60 * 1000, this.config.updateInterval);
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
			this.googleEvents = events;
			Log.info(`[MMM-GoogleCalendar] ielādēti ${events.length} notikumi (no ${(data.items || []).length} API atbildē)`);
			this.failures = 0;
			this.publish();
		} catch (err) {
			this.failures += 1;
			Log.error(`[MMM-GoogleCalendar] ${err.message} (kļūda #${this.failures})`);
			this.sendSocketNotification("GCAL_ERROR", err.message);
		} finally {
			this.scheduleNext();
		}
	},

	// Apvieno Google + ICS. Aptaujājam bieži, bet ekrānu pārzīmējam tikai, ja
	// kalendārā tiešām kas mainījies — citādi visi kalendāra moduļi mirgotu.
	publish () {
		const events = [...(this.googleEvents || []), ...(this.icsEvents || [])].sort((a, b) => a.startDate - b.startDate);
		this.events = events;
		const json = JSON.stringify(events);
		if (json !== this.lastSent) {
			this.lastSent = json;
			this.sendSocketNotification("GCAL_DATA", events);
		}
	},

	/* ------------------------------ ICS (Outlook u.c.) ------------------------------ */

	async pollIcs () {
		clearTimeout(this.icsTimer);
		if (!this.feeds.length || !this.config) return;
		const from = new Date(Date.now() - DAY_MS);
		const to = new Date(Date.now() + this.config.maximumNumberOfDays * DAY_MS);
		const all = [];
		let failed = 0;
		for (const feed of this.feeds) {
			try {
				const res = await fetch(feed.url, { signal: AbortSignal.timeout(20000) });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const events = parseIcsEvents(await res.text(), feed.name, from, to);
				all.push(...events);
				Log.info(`[MMM-GoogleCalendar] ${feed.name}: ${events.length} notikumi`);
			} catch (err) {
				failed += 1;
				Log.error(`[MMM-GoogleCalendar] ${feed.name} (ICS): ${err.message}`);
				// Paturam iepriekšējos šī kalendāra notikumus, lai tie nepazūd tīkla kļūmes dēļ.
				all.push(...this.icsEvents.filter((e) => e.source === feed.name));
			}
		}
		this.icsFailures = failed === this.feeds.length ? this.icsFailures + 1 : 0;
		this.icsEvents = all;
		this.publish();
		const base = Math.max(60 * 1000, this.config.icsUpdateInterval || 5 * 60 * 1000);
		const delay = this.icsFailures ? Math.min(base * 2 ** Math.min(this.icsFailures, 4), 60 * 60 * 1000) : base;
		this.icsTimer = setTimeout(() => this.pollIcs(), delay);
	},

	// Google Calendar API (ar singleEvents=true) jau pats izvērš atkārtotos
	// notikumus, tāpēc šeit vajadzīga tikai lauku pārsaukšana/formāta maiņa.
	normalize (item) {
		const start = item.start && (item.start.dateTime || item.start.date);
		if (!start) return null;
		const end = item.end && (item.end.dateTime || item.end.date);
		const fullDayEvent = !!(item.start.date && !item.start.dateTime);
		const startDate = parseGoogleTime(start);
		return {
			id: item.id,
			fromMirror: Boolean(item.extendedProperties && item.extendedProperties.private && item.extendedProperties.private.createdBy === MIRROR_TAG),
			title: item.summary || "",
			startDate,
			endDate: end ? parseGoogleTime(end) : startDate,
			fullDayEvent
		};
	},

	/* ------------------------- telefona lapa: notikumu pievienošana ------------------------- */

	phoneUrls () {
		const port = (global.config && global.config.port) || 8080;
		const out = [];
		for (const addrs of Object.values(os.networkInterfaces())) {
			for (const a of addrs || []) {
				if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${port}/calendar`);
			}
		}
		out.push(`http://${os.hostname()}.local:${port}/calendar`);
		return out;
	},

	// Adrese + QR kods MMM-CalendarAgenda lapai (lai telefonā pietiek noskenēt).
	async sendPhoneLink () {
		const url = this.phoneUrls()[0];
		let qrSvg = null;
		const qr = loadQrCode();
		if (qr) {
			try {
				// Melns uz balta (nevis inversais) — to nolasa visas telefonu kameras.
				qrSvg = await qr.toString(url, { type: "svg", margin: 2 });
			} catch (err) {
				Log.warn(`[MMM-GoogleCalendar] neizdevās izveidot QR kodu: ${err.message}`);
			}
		}
		this.sendSocketNotification("GCAL_PHONE_LINK", { url, qrSvg });
	},

	phoneState () {
		const now = Date.now();
		return {
			status: this.status,
			canWrite: this.status === "connected" && this.canWrite(),
			pairing: this.status === "pairing" ? this.pairingInfo : null,
			events: this.events
				.filter((e) => e.endDate > now)
				.slice(0, 30)
				.map(({ id, title, startDate, endDate, fullDayEvent, fromMirror }) => ({ id, title, startDate, endDate, fullDayEvent, fromMirror }))
		};
	},

	async calendarRequest (url, options = {}) {
		const token = await this.getAccessToken();
		const res = await fetch(url, {
			...options,
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
		});
		if (res.status === 403) {
			throw new Error("Spogulim nav atļaujas mainīt kalendāru — nospied \"Atjaunot Google atļauju\".");
		}
		if (!res.ok && res.status !== 204) throw new Error(`Google kļūda ${res.status}: ${await res.text()}`);
		return res.status === 204 ? null : res.json();
	},

	// Pārbauda un pārveido telefona formu Google notikumā.
	buildEvent (body) {
		const title = String(body.title || "").trim();
		if (!title) throw new Error("Ieraksti, kas tas ir par notikumu.");
		if (title.length > 200) throw new Error("Nosaukums ir par garu.");
		const date = String(body.date || "");
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new Error("Izvēlies datumu.");

		const event = {
			summary: title,
			extendedProperties: { private: { createdBy: MIRROR_TAG } }
		};
		if (body.allDay) {
			const next = new Date(`${date}T00:00:00Z`);
			next.setUTCDate(next.getUTCDate() + 1);
			event.start = { date };
			event.end = { date: next.toISOString().slice(0, 10) };
			return event;
		}

		const time = /^([01]\d|2[0-3]):[0-5]\d$/;
		const start = String(body.start || "");
		if (!time.test(start)) throw new Error("Izvēlies sākuma laiku.");
		let end = String(body.end || "");
		if (!end) {
			// Bez beigu laika — stunda pēc sākuma (bet ne pāri pusnaktij).
			const [h, m] = start.split(":").map(Number);
			end = h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
		}
		if (!time.test(end)) throw new Error("Nepareizs beigu laiks.");
		if (end <= start) throw new Error("Beigām jābūt pēc sākuma.");

		// Laika josla no telefona (tā, kurā cilvēks domā), citādi — no servera.
		let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		try {
			if (body.timeZone) timeZone = new Intl.DateTimeFormat("en", { timeZone: String(body.timeZone) }).resolvedOptions().timeZone;
		} catch (err) {
			// nederīga josla — paliek servera
		}
		event.start = { dateTime: `${date}T${start}:00`, timeZone };
		event.end = { dateTime: `${date}T${end}:00`, timeZone };
		return event;
	},

	async addEvent (body) {
		if (this.status !== "connected") throw new Error("Kalendārs vēl nav pieslēgts.");
		const event = this.buildEvent(body);
		await this.calendarRequest(EVENTS_URL, { method: "POST", body: JSON.stringify(event) });
		Log.info(`[MMM-GoogleCalendar] pievienots notikums no telefona: ${event.summary}`);
		await this.poll(); // lai spogulis un telefona lapa to rāda uzreiz
	},

	// Dzēst drīkst tikai no spoguļa pievienotos notikumus — pārējie ir cilvēka
	// Google kalendārā, un lapai nav paroles (to sargā tikai ipWhitelist).
	async deleteEvent (id) {
		if (this.status !== "connected") throw new Error("Kalendārs vēl nav pieslēgts.");
		if (typeof id !== "string" || !/^[a-zA-Z0-9_]+$/.test(id)) throw new Error("Nepareizs notikums.");
		const url = `${EVENTS_URL}/${encodeURIComponent(id)}`;
		const item = await this.calendarRequest(url);
		const tag = item.extendedProperties && item.extendedProperties.private && item.extendedProperties.private.createdBy;
		if (tag !== MIRROR_TAG) throw new Error("Šo notikumu var izdzēst tikai Google kalendārā.");
		await this.calendarRequest(url, { method: "DELETE" });
		await this.poll();
	},

	// Ja tokenam ir tikai lasīšanas atļauja (pieslēgts pirms šīs funkcijas), vajag
	// vienreiz pieslēgties no jauna. Jaunais kods parādās gan spogulī, gan telefonā.
	reconnect () {
		if (!this.clientId) throw new Error("Nav iestatīts Google OAuth klients (secrets.js).");
		clearTimeout(this.timer);
		this.clearToken();
		this.status = "starting";
		this.googleEvents = [];
		this.events = [...this.icsEvents];
		this.lastSent = null;
		this.beginPairing();
	},

	registerRoutes () {
		const app = this.expressApp;
		// Tikai application/json (tāpat kā /routines): svešas lapas bez CORS šādu POST nevar nosūtīt.
		const parse = express.json({ limit: "10kb" });
		const json = (req, res, next) => {
			if (!req.is("application/json")) return res.status(415).json({ error: "Vajag Content-Type: application/json" });
			parse(req, res, next);
		};
		const action = (fn) => async (req, res) => {
			try {
				await fn(req.body || {});
				res.json(this.phoneState());
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		};

		app.get("/calendar", (req, res) => {
			res.set("Cache-Control", "no-cache");
			res.sendFile(path.join(__dirname, "public", "index.html"));
		});
		app.get("/calendar/api/state", (req, res) => res.json(this.phoneState()));
		app.post("/calendar/api/events", json, action((body) => this.addEvent(body)));
		app.post("/calendar/api/delete", json, action((body) => this.deleteEvent(body.id)));
		app.post("/calendar/api/reconnect", json, action(async () => {
			this.reconnect();
			// beginPairing ir asinhrons — pagaida, lai atbildē jau ir kods.
			for (let i = 0; i < 20 && this.status !== "pairing"; i++) await new Promise((r) => setTimeout(r, 100));
		}));
	}
});

// Visas dienas notikumiem Google dod tikai datumu ("2026-03-05"), ko
// `new Date()` parsētu kā UTC pusnakti — tad Rīgā tas būtu 03:00 un beigu
// datums (izslēdzošs) iekristu nākamajā dienā. Parsējam kā VIETĒJO pusnakti.
function parseGoogleTime (value) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
	return new Date(value).getTime();
}

// Testiem (tests/unit/modules/custom/googlecalendar_helper_spec.js).
module.exports.parseIcsEvents = parseIcsEvents;
module.exports.normalizeFeeds = normalizeFeeds;
