/* node_helper priekš MMM-SpotifyNowPlaying
 *
 * Atjauno access token no refresh token un periodiski vaicā Spotify,
 * kas pašlaik skan. Nekādas ārējās bibliotēkas — izmanto iebūvēto fetch.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const NOW_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";

module.exports = NodeHelper.create({
	start () {
		this.config = null;
		this.accessToken = null;
		this.accessTokenExpiry = 0;
		this.timer = null;
		this.lastPollAt = 0;
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "SPOTIFY_CONFIG") {
			this.config = payload;
			if (this.timer) clearInterval(this.timer);
			this.poll();
			this.timer = setInterval(() => this.poll(), Math.max(5000, this.config.updateInterval));
		} else if (notification === "SPOTIFY_POLL_NOW") {
			// Frontend ziņo, ka dziesma beigusies — vaicājam uzreiz (ar drošības
			// slieksni, lai nepārslogotu API).
			if (Date.now() - this.lastPollAt > 3000) this.poll();
		}
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
				this.sendSocketNotification("SPOTIFY_PLAYING", null);
				return;
			}
			if (res.status === 401) {
				// Token beidzies — piespiedu atjaunošana nākamajā ciklā
				this.accessToken = null;
				return;
			}
			if (!res.ok) {
				throw new Error(`currently-playing ${res.status}: ${await res.text()}`);
			}

			const data = await res.json();
			const item = data && data.item;
			if (!item) {
				this.sendSocketNotification("SPOTIFY_PLAYING", null);
				return;
			}

			const images = (item.album && item.album.images) || [];
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
			Log.error(`[MMM-SpotifyNowPlaying] ${err.message}`);
			this.sendSocketNotification("SPOTIFY_ERROR", err.message);
		}
	}
});
