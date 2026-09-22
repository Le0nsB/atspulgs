/* MagicMirror² Module: MMM-SpotifyNowPlaying
 *
 * Rāda, kāda Spotify dziesma pašlaik skan tavā kontā. Datus iegūst
 * node_helper caur Spotify Web API — akreditācijas dati nāk no
 * MagicMirror/secrets.js (skat. README.md), klientam tie netiek sūtīti.
 *
 * Starp Spotify vaicājumiem atskaņošanas josla un laiks turpina "tikt"
 * lokāli (reizi sekundē), lai izskatītos dzīvi. Katrs jauns vaicājums
 * atkal sinhronizē reālo pozīciju.
 */
Module.register("MMM-SpotifyNowPlaying", {
	defaults: {
		updateInterval: 15 * 1000, // cik bieži vaicāt Spotify (ms)
		showAlbumArt: true,
		showProgress: true,
		hideWhenNothingPlaying: true,
		className: "small",

		// --- atskaņošanas vadība (prasa Spotify Premium + aktīvu ierīci) ---
		// Notifikācijas, ko sūta žesti/balss/tālvadība, lai vadītu atskaņošanu.
		// null = tā darbība izslēgta.
		playNotification: "SPOTIFY_PLAY",
		pauseNotification: "SPOTIFY_PAUSE",
		toggleNotification: "SPOTIFY_TOGGLE", // play/pause atkarībā no stāvokļa
		nextNotification: "SPOTIFY_NEXT",
		prevNotification: "SPOTIFY_PREV",
		volumeUpNotification: "SPOTIFY_VOLUME_UP",
		volumeDownNotification: "SPOTIFY_VOLUME_DOWN",
		volumeStep: 10 // procentpunkti vienai "skaļāk"/"klusāk" reizei
	},

	getStyles () {
		return ["font-awesome.css", "MMM-SpotifyNowPlaying.css"];
	},

	start () {
		this.track = null; // { isPlaying, title, artist, album, albumArt, progressMs, durationMs }
		this.trackReceivedAt = 0; // Date.now(), kad saņēmām pēdējos datus
		this.ticker = null; // lokālais sekundes taimeris
		this.hasError = false;
		this.barFill = null; // DOM atsauces, ko atjaunot bez pilnas pārzīmēšanas
		this.timeEl = null;
		this.controlMessage = null; // īslaicīgs kļūdas teksts pēc neveiksmīgas vadības

		// Akreditācijas datus (secrets.js) ielasa tikai node_helper — klientam tie netiek sūtīti.
		this.sendSocketNotification("SPOTIFY_CONFIG", this.config);
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "SPOTIFY_NO_CREDENTIALS") {
			this.hasError = "config";
			this.updateDom();
			return;
		}
		if (notification === "SPOTIFY_PLAYING") {
			this.hasError = false;
			this.track = payload; // var būt null, ja nekas neskan
			this.trackReceivedAt = Date.now();
			this.updateDom(500);
			this.manageTicker();
		} else if (notification === "SPOTIFY_ERROR") {
			this.hasError = payload || true;
			this.updateDom(500);
		} else if (notification === "SPOTIFY_CONTROL_ERROR") {
			this.showControlMessage(payload);
		}
	},

	// Vadības notifikācijas no citiem moduļiem (balss/žesti/tālvadība).
	notificationReceived (notification, payload) {
		const c = this.config;
		switch (notification) {
			case c.playNotification: this.control("play"); break;
			case c.pauseNotification: this.control("pause"); break;
			case c.toggleNotification: this.control("toggle"); break;
			case c.nextNotification: this.control("next"); break;
			case c.prevNotification: this.control("previous"); break;
			case c.volumeUpNotification: this.control("volume_step", c.volumeStep); break;
			case c.volumeDownNotification: this.control("volume_step", -c.volumeStep); break;
			default: break;
		}
	},

	control (action, value) {
		if (this.hasError === "config") return; // nav akreditācijas — nav ko darīt
		this.sendSocketNotification("SPOTIFY_CONTROL", { action, value });
	},

	// Īslaicīgi parāda kļūdu (piem. "vajag Premium"), pat ja hideWhenNothingPlaying
	// citādi widget'u slēptu — citādi lietotājs neko neredzētu un nezinātu, kāpēc.
	showControlMessage (text) {
		this.controlMessage = text;
		this.updateDom(200);
		clearTimeout(this._controlMsgTimer);
		this._controlMsgTimer = setTimeout(() => {
			this.controlMessage = null;
			this.updateDom(500);
		}, 4000);
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
			this.timeEl.textContent = `${this.msToTime(progressMs)} / ${this.msToTime(this.track.durationMs)}`;
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
			wrapper.innerHTML = "MMM-SpotifyNowPlaying: trūkst Spotify atslēgu (MagicMirror/secrets.js)";
			return wrapper;
		}

		if (this.controlMessage) {
			wrapper.className += " dimmed light small";
			const icon = document.createElement("i");
			icon.className = "fa-solid fa-music mmm-spotify-control-icon";
			wrapper.appendChild(icon);
			wrapper.appendChild(document.createTextNode(` ${this.controlMessage}`));
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
		title.textContent = this.track.title;
		info.appendChild(title);

		const artist = document.createElement("div");
		artist.className = "mmm-spotify-artist light";
		artist.textContent = this.track.artist;
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
			this.timeEl.textContent = `${this.msToTime(progress)} / ${this.msToTime(this.track.durationMs)}`;
			info.appendChild(this.timeEl);
		}

		wrapper.appendChild(info);
		return wrapper;
	},

	stop () {
		if (this.ticker) clearInterval(this.ticker);
		clearTimeout(this._controlMsgTimer);
	}
});
