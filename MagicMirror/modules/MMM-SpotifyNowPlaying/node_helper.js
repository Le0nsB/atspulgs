/* node_helper priekš MMM-SpotifyNowPlaying
 *
 * Atjauno access token no refresh token un periodiski vaicā Spotify,
 * kas pašlaik skan. Nekādas ārējās bibliotēkas — izmanto iebūvēto fetch.
 *
 * Pieslēgšana: telefona lapa http://<pi-ip>:8080/spotify (skat.
 * spotify-setup.js) saglabā atslēgas data/spotify.json; šis helperis failu
 * vēro un pārlādē atslēgas bez MagicMirror restarta.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const phoneAuth = require("../../lib/phone-auth");
const { SpotifySetup, loadFromDataFile } = require("./spotify-setup");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_FILE = path.join(ROOT, "data", "spotify.json");

// Spotify akreditācijas dati tiek lasīti TIKAI šeit, servera pusē, no MagicMirror/secrets.js.
// Tie nedrīkst nonākt modulī `config` (to MagicMirror atdod pārlūkam caur /config un
// /api/config) un nedrīkst atrasties mapē config/ vai modules/ (tās MagicMirror atdod pa HTTP
// kā statiskus failus, t.i. http://<pi-ip>:8080/config/secrets.js būtu lejupielādējams).
// (Šī funkcija ir apzināti dublēta MMM-SpotifyNowPlaying un MMM-SpotifyDetail — moduļi ir neatkarīgi.)
function loadSpotifyCredentials () {
	// Jaunais veids: pieslēgts no telefona (data/spotify.json). Vecais: secrets.js.
	const fromPhone = loadFromDataFile(DATA_FILE);
	if (fromPhone) return fromPhone;
	const root = path.resolve(__dirname, "..", "..");
	const candidates = [path.join(root, "secrets.js"), path.join(root, "config", "secrets.js")];
	for (const file of candidates) {
		if (!fs.existsSync(file)) continue;
		if (file.includes(`${path.sep}config${path.sep}`)) {
			Log.warn(`MMM-SpotifyNowPlaying: ${file} ir lejupielādējams no tīkla (http://<ip>:8080/config/secrets.js) — pārvieto to uz ${candidates[0]}`);
		}
		try {
			const { clientId, clientSecret, refreshToken } = require(file).spotify || {};
			return clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken } : null;
		} catch (error) {
			Log.error(`MMM-SpotifyNowPlaying: neizdevās ielasīt ${file}: ${error.message}`);
			return null;
		}
	}
	return null;
}


const TOKEN_URL = "https://accounts.spotify.com/api/token";
const NOW_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";
const PLAYER_URL = "https://api.spotify.com/v1/me/player";

module.exports = NodeHelper.create({
	start () {
		this.config = null;
		this.accessToken = null;
		this.accessTokenExpiry = 0;
		this.timer = null;
		this.lastPollAt = 0;
		this.failures = 0; // secīgu kļūdu skaits -> eksponenciāla atkāpšanās
		this.lastIsPlaying = false; // pēdējais zināmais stāvoklis (priekš "toggle")
		this.lastVolume = 50; // pēdējā zināmā skaļuma vērtība (priekš relatīva +/-)
		this.clientConfig = null; // pēdējais SPOTIFY_CONFIG no pārlūka (lai var pārlādēt atslēgas)
		this.setup = new SpotifySetup({ dataFile: DATA_FILE, log: Log });
		this.registerRoutes();
		// Pieslēgšana no telefona maina failu -> pārlādējam atslēgas bez restarta.
		fs.watchFile(DATA_FILE, { interval: 2000 }, () => this.reloadCredentials());
		this.lastControlKey = null;
		this.lastControlAt = 0;
		// Izrakstoties telefoni aizmirsti un kods nomainīts -> jauns QR kods spogulī.
		phoneAuth.on("reset", () => {
			if (this.clientConfig && !this.config) this.sendNoCredentials();
		});
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "SPOTIFY_CONFIG") {
			this.clientConfig = payload;
			this.config = null;
			this.reloadCredentials();
		} else if (notification === "SPOTIFY_POLL_NOW") {
			// Frontend ziņo, ka dziesma beigusies — vaicājam uzreiz (ar drošības
			// slieksni, lai nepārslogotu API).
			if (Date.now() - this.lastPollAt > 3000) this.poll();
		} else if (notification === "SPOTIFY_CONTROL") {
			// Balss komandu saņem visi klienti (TV + MacBook mikrofons), un katrs to
			// pārsūta šurp — citādi "nākamā dziesma" pārslēgtu divas dziesmas.
			const key = `${payload && payload.action}:${payload && payload.value}`;
			if (key === this.lastControlKey && Date.now() - this.lastControlAt < 1000) return;
			this.lastControlKey = key;
			this.lastControlAt = Date.now();
			this.control(payload && payload.action, payload && payload.value);
		}
	},

	stop () {
		fs.unwatchFile(DATA_FILE);
	},

	// Ielādē atslēgas (no data/spotify.json vai secrets.js) un sāk/aptur vaicāšanu.
	reloadCredentials () {
		if (!this.clientConfig) return;
		const credentials = loadSpotifyCredentials();
		if (!credentials) {
			clearTimeout(this.timer);
			this.config = null;
			this.accessToken = null;
			this.sendNoCredentials();
			return;
		}
		const same = this.config
			&& this.config.clientId === credentials.clientId
			&& this.config.refreshToken === credentials.refreshToken;
		if (same) return;
		this.config = { ...this.clientConfig, ...credentials };
		this.accessToken = null;
		this.failures = 0;
		Log.info("[MMM-SpotifyNowPlaying] Spotify atslēgas ielādētas");
		this.poll(); // pats ieplāno nākamo vaicājumu
	},

	// QR kods ved caur /pair (pieslēdz telefonu) — to redz tikai spoguļa paša ekrāns.
	sendNoCredentials () {
		return phoneAuth.sendPhoneLink(this, "SPOTIFY_NO_CREDENTIALS", this.phoneUrl());
	},

	phoneUrl () {
		const port = (global.config && global.config.port) || 8080;
		for (const addrs of Object.values(os.networkInterfaces())) {
			for (const a of addrs || []) {
				if (a.family === "IPv4" && !a.internal) return `http://${a.address}:${port}/spotify`;
			}
		}
		return `http://${os.hostname()}.local:${port}/spotify`;
	},

	/* ------------------------- telefona lapa /spotify ------------------------- */

	registerRoutes () {
		const app = this.expressApp;
		if (!app) return;
		// Kas drīkst: tikai pieslēgts telefons (vai pats Pi) — skat. lib/phone-auth.js.
		// guard pārbauda arī Host galveni, tāpēc loginUrl() saņem tikai paša spoguļa adresi.
		phoneAuth.install(app);
		const guard = phoneAuth.guard();
		// Tikai application/json (tāpat kā /routines, /calendar, /todo). Tā nav autentifikācija.
		const parse = express.json({ limit: "10kb" });
		const json = (req, res, next) => {
			if (!req.is("application/json")) return res.status(415).json({ error: "Vajag Content-Type: application/json" });
			parse(req, res, next);
		};
		const state = () => this.setup.state(Boolean(loadSpotifyCredentials()));
		const action = (fn) => async (req, res) => {
			try {
				const extra = await fn(req);
				res.json({ ...state(), ...(extra || {}) });
			} catch (error) {
				res.status(400).json({ error: error.message });
			}
		};

		app.get("/spotify", phoneAuth.page(path.join(__dirname, "public", "index.html")));
		app.get("/spotify/api/state", guard, (req, res) => res.json(state()));
		app.post("/spotify/api/app", guard, json, action((req) => this.setup.saveApp(req.body.clientId, req.body.clientSecret)));
		// Spoguļa adrese, kā to redz telefons — uz turieni starplapa atgriezīs pēc pieteikšanās.
		app.post("/spotify/api/login", guard, json, action((req) => ({ url: this.setup.loginUrl(`${req.protocol}://${req.get("host")}`) })));
		app.post("/spotify/api/disconnect", guard, json, action(() => this.setup.disconnect()));
		app.post("/spotify/api/reset", guard, json, action(() => this.setup.reset()));
		// Atgriešanās no Spotify: sīkdatni te neprasām (to aizsargā vienreizējs nonce no
		// /spotify/api/login, ko var iegūt tikai pieslēgts telefons), tikai Host.
		app.get("/spotify/callback", phoneAuth.hostOnly(), async (req, res) => {
			try {
				await this.setup.callback(req.query || {});
				this.reloadCredentials();
				res.redirect("/spotify?connected=1");
			} catch (error) {
				Log.warn(`[MMM-SpotifyNowPlaying] pieslēgšana neizdevās: ${error.message}`);
				res.redirect(`/spotify?error=${encodeURIComponent(error.message)}`);
			}
		});
	},

	// Nākamā vaicājuma intervāls: normāli `updateInterval`, bet pēc secīgām
	// kļūdām (piem. nederīgs refreshToken) palielinām līdz 5 min, lai
	// nespamotu Spotify API.
	scheduleNext () {
		if (!this.config) return;
		clearTimeout(this.timer);
		const base = Math.max(5000, this.config.updateInterval);
		const delay = this.failures > 0
			? Math.min(base * 2 ** Math.min(this.failures, 5), 5 * 60 * 1000)
			: base;
		this.timer = setTimeout(() => this.poll(), delay);
	},

	async getAccessToken () {
		if (this.accessToken && Date.now() < this.accessTokenExpiry - 5000) {
			return this.accessToken;
		}
		const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
		const body = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: this.config.refreshToken
		});
		const res = await fetch(TOKEN_URL, {
			method: "POST",
			headers: {
				Authorization: `Basic ${basic}`,
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`token refresh failed (${res.status}): ${text}`);
		}
		const data = await res.json();
		this.accessToken = data.access_token;
		this.accessTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
		if (data.refresh_token && data.refresh_token !== this.config.refreshToken) this.saveRefreshToken(data.refresh_token);
		return this.accessToken;
	},

	// Spotify dažreiz atjaunojot iedod JAUNU refresh token — vecais tad var vairs nederēt,
	// tāpēc saglabājam to data/spotify.json (arī, ja atslēgas nāca no secrets.js).
	saveRefreshToken (refreshToken) {
		// Vispirms atmiņā, lai fs.watchFile -> reloadCredentials() to uzskata par "to pašu".
		this.config.refreshToken = refreshToken;
		const { clientId, clientSecret } = this.config;
		try {
			const d = this.setup.read();
			// Telefonā saglabāta CITA lietotne (vēl nepieslēgta) — to nepārrakstām.
			if (d.clientId && d.clientId !== clientId) return;
			this.setup.write({ ...d, clientId, clientSecret, refreshToken });
			Log.info("[MMM-SpotifyNowPlaying] Spotify iedeva jaunu refresh token — saglabāts");
		} catch (error) {
			Log.error(`[MMM-SpotifyNowPlaying] neizdevās saglabāt jauno refresh token: ${error.message}`);
		}
	},

	async poll () {
		if (!this.config) return;
		this.lastPollAt = Date.now();
		try {
			const token = await this.getAccessToken();
			const res = await fetch(NOW_PLAYING_URL, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.status === 204 || res.status === 202) {
				// Nekas neskan / nav aktīvas ierīces
				this.failures = 0;
				this.lastIsPlaying = false;
				this.sendSocketNotification("SPOTIFY_PLAYING", null);
				return;
			}
			if (res.status === 401) {
				// Token noraidīts — atjaunojam nākamajā ciklā, bet skaitām kā kļūdu,
				// lai pastāvīga 401 cilpa atkāpjas, nevis spamo API.
				this.accessToken = null;
				this.failures += 1;
				return;
			}
			if (!res.ok) {
				throw new Error(`currently-playing ${res.status}: ${await res.text()}`);
			}

			const data = await res.json();
			const item = data && data.item;
			if (!item) {
				this.failures = 0;
				this.sendSocketNotification("SPOTIFY_PLAYING", null);
				return;
			}

			const images = (item.album && item.album.images) || [];
			this.failures = 0;
			this.lastIsPlaying = !!data.is_playing;
			if (data.device && typeof data.device.volume_percent === "number") {
				this.lastVolume = data.device.volume_percent;
			}
			this.sendSocketNotification("SPOTIFY_PLAYING", {
				isPlaying: !!data.is_playing,
				title: item.name || "",
				artist: (item.artists || []).map((a) => a.name).join(", "),
				album: (item.album && item.album.name) || "",
				albumArt: images.length ? images[images.length - 1].url : "",
				progressMs: data.progress_ms || 0,
				durationMs: item.duration_ms || 0
			});
		} catch (err) {
			this.failures += 1;
			Log.error(`[MMM-SpotifyNowPlaying] ${err.message} (kļūda #${this.failures})`);
			this.sendSocketNotification("SPOTIFY_ERROR", err.message);
		} finally {
			this.scheduleNext();
		}
	},

	/* Atskaņošanas vadība (play/pause/toggle/next/previous/volume). Prasa
	 * Spotify Premium + aktīvu ierīci (skat. README.md). Pēc veiksmīgas
	 * darbības uzreiz palūdzam svaigu stāvokli, lai ekrāns atsvaidzinās ātri. */
	async control (action, value) {
		if (!this.config || !action) return;
		try {
			const token = await this.getAccessToken();
			const headers = { Authorization: `Bearer ${token}` };
			let url;
			let method;

			switch (action) {
				case "play":
					url = `${PLAYER_URL}/play`; method = "PUT"; break;
				case "pause":
					url = `${PLAYER_URL}/pause`; method = "PUT"; break;
				case "toggle":
					url = `${PLAYER_URL}/${this.lastIsPlaying ? "pause" : "play"}`; method = "PUT"; break;
				case "next":
					url = `${PLAYER_URL}/next`; method = "POST"; break;
				case "previous":
					url = `${PLAYER_URL}/previous`; method = "POST"; break;
				case "volume": {
					const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
					url = `${PLAYER_URL}/volume?volume_percent=${pct}`; method = "PUT";
					break;
				}
				case "volume_step": {
					const pct = Math.max(0, Math.min(100, Math.round(this.lastVolume + (Number(value) || 0))));
					url = `${PLAYER_URL}/volume?volume_percent=${pct}`; method = "PUT";
					this.lastVolume = pct; // optimistiski; nākamais poll() precizēs
					break;
				}
				default:
					return;
			}

			const res = await fetch(url, { method, headers });

			if (res.ok || res.status === 204) {
				setTimeout(() => this.poll(), 400); // atsvaidzinām stāvokli drīz pēc darbības
				return;
			}
			if (res.status === 404) {
				this.sendSocketNotification("SPOTIFY_CONTROL_ERROR", "Nav aktīvas Spotify ierīces — atver Spotify kādā ierīcē.");
				return;
			}
			if (res.status === 403) {
				this.sendSocketNotification("SPOTIFY_CONTROL_ERROR", "Atskaņošanas vadība prasa Spotify Premium.");
				return;
			}
			if (res.status === 401) {
				this.accessToken = null; // token noraidīts — nākamā darbība/poll atjaunos
				this.sendSocketNotification("SPOTIFY_CONTROL_ERROR", "Autorizācija noraidīta — mēģini vēlreiz.");
				return;
			}
			throw new Error(`${method} ${url} -> ${res.status}: ${await res.text()}`);
		} catch (err) {
			Log.error(`[MMM-SpotifyNowPlaying] kontroles kļūda (${action}): ${err.message}`);
			this.sendSocketNotification("SPOTIFY_CONTROL_ERROR", `Kontrole neizdevās: ${err.message}`);
		}
	}
});
