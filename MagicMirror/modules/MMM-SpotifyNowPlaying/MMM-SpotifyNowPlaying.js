/* MagicMirror² Module: MMM-SpotifyNowPlaying
 *
 * Rāda, kāda Spotify dziesma pašlaik skan tavā kontā. Datus iegūst
 * node_helper caur Spotify Web API (nepieciešams clientId, clientSecret
 * un refreshToken — skat. README.md).
 *
 * Starp Spotify vaicājumiem atskaņošanas josla un laiks turpina "tikt"
 * lokāli (reizi sekundē), lai izskatītos dzīvi. Katrs jauns vaicājums
 * atkal sinhronizē reālo pozīciju.
 */
Module.register("MMM-SpotifyNowPlaying", {
	defaults: {
		clientId: "",
		clientSecret: "",
		refreshToken: "",
		updateInterval: 15 * 1000, // cik bieži vaicāt Spotify (ms)
		showAlbumArt: true,
		showProgress: true,
		hideWhenNothingPlaying: true,
		className: "small"
	},

	getStyles () {
		return ["MMM-SpotifyNowPlaying.css"];
	},

	start () {
		this.track = null; // { isPlaying, title, artist, album, albumArt, progressMs, durationMs }
		this.trackReceivedAt = 0; // Date.now(), kad saņēmām pēdējos datus
		this.ticker = null; // lokālais sekundes taimeris
		this.hasError = false;
		this.barFill = null; // DOM atsauces, ko atjaunot bez pilnas pārzīmēšanas
		this.timeEl = null;

		if (!this.config.clientId || !this.config.clientSecret || !this.config.refreshToken) {
			this.hasError = "config"; // trūkst akreditācijas datu
			this.updateDom();
			return;
		}
		this.sendSocketNotification("SPOTIFY_CONFIG", this.config);
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "SPOTIFY_PLAYING") {
			this.hasError = false;
			this.track = payload; // var būt null, ja nekas neskan
			this.trackReceivedAt = Date.now();
			this.updateDom(500);
			this.manageTicker();
		} else if (notification === "SPOTIFY_ERROR") {
			this.hasError = payload || true;
			this.updateDom(500);
		}
	},

	/* Cik tālu dziesma ir tikusi ŠOBRĪD — reālā pozīcija plus laiks,
	 * kas pagājis kopš pēdējiem datiem (tikai ja atskaņo). */
	currentProgressMs () {
		if (!this.track) return 0;
		let p = this.track.progressMs || 0;
		if (this.track.isPlaying) p += Date.now() - this.trackReceivedAt;
		return Math.min(p, this.track.durationMs || p);
	},

	/* Ieslēdz/izslēdz lokālo sekundes taimeri atkarībā no stāvokļa. */
	manageTicker () {
		if (this.ticker) {
			clearInterval(this.ticker);
			this.ticker = null;
		}
		const playing = this.track && this.track.isPlaying;
		if (!playing || !this.config.showProgress || !this.track.durationMs) return;

		this.ticker = setInterval(() => {
			const progress = this.currentProgressMs();
			this.renderProgress(progress);
			// Dziesma beigusies — palūdzam Spotify uzreiz, lai nākamā parādās ātri.
			if (progress >= this.track.durationMs) {
				clearInterval(this.ticker);
				this.ticker = null;
				this.sendSocketNotification("SPOTIFY_POLL_NOW");
			}
		}, 1000);
	},

	/* Atjauno tikai joslu un laiku (bez albuma vāciņa pārlādes). */
	renderProgress (progressMs) {
		if (!this.track || !this.track.durationMs) return;
		if (this.barFill) {
			const pct = Math.min(100, (progressMs / this.track.durationMs) * 100);
			this.barFill.style.width = `${pct}%`;
		}
		if (this.timeEl) {
			this.timeEl.innerHTML = `${this.msToTime(progressMs)} / ${this.msToTime(this.track.durationMs)}`;
		}
	},

	msToTime (ms) {
		const total = Math.max(0, Math.floor(ms / 1000));
		const m = Math.floor(total / 60);
		const s = String(total % 60).padStart(2, "0");
		return `${m}:${s}`;
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = `mmm-spotify ${this.config.className}`;
		this.barFill = null;
		this.timeEl = null;

		if (this.hasError === "config") {
			wrapper.className += " dimmed light";
			wrapper.innerHTML = "MMM-SpotifyNowPlaying: trūkst clientId/clientSecret/refreshToken";
			return wrapper;
		}

		if (!this.track || !this.track.isPlaying) {
			if (this.config.hideWhenNothingPlaying) return wrapper; // tukšs = paslēpts
			wrapper.className += " dimmed light";
			wrapper.innerHTML = "Spotify: nekas neskan";
			return wrapper;
		}

		if (this.config.showAlbumArt && this.track.albumArt) {
			const img = document.createElement("img");
			img.className = "mmm-spotify-art";
			img.src = this.track.albumArt;
			wrapper.appendChild(img);
		}

		const info = document.createElement("div");
		info.className = "mmm-spotify-info";

		const title = document.createElement("div");
		title.className = "mmm-spotify-title bright";
		title.innerHTML = this.track.title;
		info.appendChild(title);

		const artist = document.createElement("div");
		artist.className = "mmm-spotify-artist light";
		artist.innerHTML = this.track.artist;
		info.appendChild(artist);

		if (this.config.showProgress && this.track.durationMs) {
			const progress = this.currentProgressMs();

			const bar = document.createElement("div");
			bar.className = "mmm-spotify-bar";
			this.barFill = document.createElement("div");
			this.barFill.className = "mmm-spotify-bar-fill";
			this.barFill.style.width = `${Math.min(100, (progress / this.track.durationMs) * 100)}%`;
			bar.appendChild(this.barFill);
			info.appendChild(bar);

			this.timeEl = document.createElement("div");
			this.timeEl.className = "mmm-spotify-time dimmed light xsmall";
			this.timeEl.innerHTML = `${this.msToTime(progress)} / ${this.msToTime(this.track.durationMs)}`;
			info.appendChild(this.timeEl);
		}

		wrapper.appendChild(info);
		return wrapper;
	}
});
