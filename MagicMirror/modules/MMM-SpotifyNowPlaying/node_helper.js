/* node_helper priekš MMM-SpotifyNowPlaying
 *
 * Atjauno access token no refresh token un periodiski vaicā Spotify,
 * kas pašlaik skan. Nekādas ārējās bibliotēkas — izmanto iebūvēto fetch.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");

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
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "SPOTIFY_CONFIG") {
			this.config = payload;
			this.failures = 0;
			this.poll(); // pats ieplāno nākamo vaicājumu
		} else if (notification === "SPOTIFY_POLL_NOW") {
			// Frontend ziņo, ka dziesma beigusies — vaicājam uzreiz (ar drošības
			// slieksni, lai nepārslogotu API).
			if (Date.now() - this.lastPollAt > 3000) this.poll();
		} else if (notification === "SPOTIFY_CONTROL") {
			this.control(payload && payload.action, payload && payload.value);
		}
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
		return this.accessToken;
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
