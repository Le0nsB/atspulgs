/* node_helper priekš MMM-SpotifyDetail
 *
 * Vaicā Spotify Web API pēc pašreizējās dziesmas UN rindā nākošajām
 * dziesmām (GET /me/player/queue — viens izsaukums dod abus). Kad dziesma
 * mainās, papildus paprasa sinhronizētos ("live") vārdus no LRCLIB
 * (https://lrclib.net) — brīvi pieejams API bez atslēgas.
 *
 * Neatkarīgs no MMM-SpotifyNowPlaying (savs token refresh cikls), lai
 * modulis paliktu pats par sevi darbojošs "plug-and-play" komponents.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const NOW_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";
const QUEUE_URL = "https://api.spotify.com/v1/me/player/queue";
const LRCLIB_URL = "https://lrclib.net/api/get";

module.exports = NodeHelper.create({
	start () {
		this.config = null;
		this.accessToken = null;
		this.accessTokenExpiry = 0;
		this.timer = null;
		this.failures = 0;
		this.lyricsCache = { trackKey: null, lines: null }; // pēdējie ielādētie vārdi
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "SPOTIFY_DETAIL_CONFIG") {
			this.config = payload;
			this.failures = 0;
			this.poll();
		}
	},

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

	trackFromItem (item) {
		if (!item) return null;
		const images = (item.album && item.album.images) || [];
		return {
			id: item.id || "",
			title: item.name || "",
			artist: (item.artists || []).map((a) => a.name).join(", "),
			album: (item.album && item.album.name) || "",
			albumArt: images.length ? images[0].url : "",
			durationMs: item.duration_ms || 0
		};
	},

	async poll () {
		if (!this.config) return;
		try {
			const token = await this.getAccessToken();
			const headers = { Authorization: `Bearer ${token}` };

			const nowRes = await fetch(NOW_PLAYING_URL, { headers });

			if (nowRes.status === 401) {
				this.accessToken = null;
				this.failures += 1;
				return;
			}
			if (nowRes.status === 204 || nowRes.status === 202) {
				this.failures = 0;
				this.sendSocketNotification("SPOTIFY_DETAIL_DATA", { track: null, queue: [], lyrics: null });
				return;
			}
			if (!nowRes.ok) throw new Error(`currently-playing ${nowRes.status}: ${await nowRes.text()}`);

			const nowData = await nowRes.json();
			const item = nowData && nowData.item;
			if (!item) {
				this.failures = 0;
				this.sendSocketNotification("SPOTIFY_DETAIL_DATA", { track: null, queue: [], lyrics: null });
				return;
			}

			const track = this.trackFromItem(item);
			track.isPlaying = !!nowData.is_playing;
			track.progressMs = nowData.progress_ms || 0;

			let queue = [];
			try {
				const queueRes = await fetch(QUEUE_URL, { headers });
				if (queueRes.ok) {
					const queueData = await queueRes.json();
					queue = (queueData.queue || [])
						.slice(0, Math.max(0, this.config.queueLimit))
						.map((it) => this.trackFromItem(it));
				}
			} catch (err) {
				Log.warn(`[MMM-SpotifyDetail] rindas vaicājums neizdevās: ${err.message}`);
			}

			this.failures = 0;
			const lyrics = await this.getLyrics(track);
			this.sendSocketNotification("SPOTIFY_DETAIL_DATA", { track, queue, lyrics });
		} catch (err) {
			this.failures += 1;
			Log.error(`[MMM-SpotifyDetail] ${err.message} (kļūda #${this.failures})`);
			this.sendSocketNotification("SPOTIFY_DETAIL_ERROR", err.message);
		} finally {
			this.scheduleNext();
		}
	},

	/* Sinhronizētie vārdi no LRCLIB, kešoti pa dziesmu (id + garums), lai
	 * katrā poll() reizē neprasītu no jauna to pašu dziesmu. */
	async getLyrics (track) {
		if (!this.config.showLyrics || !track) return null;

		const durationSec = Math.round(track.durationMs / 1000);
		const trackKey = `${track.artist}|${track.title}|${durationSec}`;
		if (this.lyricsCache.trackKey === trackKey) return this.lyricsCache.lines;

		try {
			const params = new URLSearchParams({
				artist_name: track.artist,
				track_name: track.title,
				album_name: track.album,
				duration: String(durationSec)
			});
			const res = await fetch(`${LRCLIB_URL}?${params.toString()}`);
			if (!res.ok) {
				this.lyricsCache = { trackKey, lines: false }; // false = meklēts, bet nav atrasts
				return false;
			}
			const data = await res.json();
			if (data.instrumental) {
				this.lyricsCache = { trackKey, lines: "instrumental" };
				return "instrumental";
			}
			const lines = this.parseLrc(data.syncedLyrics) || this.plainToLines(data.plainLyrics);
			this.lyricsCache = { trackKey, lines: lines || false };
			return this.lyricsCache.lines;
		} catch (err) {
			Log.warn(`[MMM-SpotifyDetail] LRCLIB vaicājums neizdevās: ${err.message}`);
			return null; // nav zināms — nerādām "nav atrasts", vienkārši mēģināsim vēlreiz
		}
	},

	/* "[01:02.34]Teksts" -> [{ timeMs, text }, ...], sakārtots pēc laika. */
	parseLrc (lrc) {
		if (!lrc) return null;
		const lineRe = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
		const lines = [];
		for (const raw of lrc.split("\n")) {
			const matches = [...raw.matchAll(lineRe)];
			if (!matches.length) continue;
			const text = raw.replace(lineRe, "").trim();
			for (const m of matches) {
				const min = Number(m[1]);
				const sec = Number(m[2]);
				const ms = m[3] ? Number(m[3].padEnd(3, "0")) : 0;
				lines.push({ timeMs: min * 60000 + sec * 1000 + ms, text });
			}
		}
		if (!lines.length) return null;
		lines.sort((a, b) => a.timeMs - b.timeMs);
		return lines;
	},

	plainToLines (plain) {
		if (!plain) return null;
		return plain.split("\n").filter((l) => l.trim().length).map((text) => ({ timeMs: null, text }));
	}
});
