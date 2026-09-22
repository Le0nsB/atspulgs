/* MagicMirror² Module: MMM-SpotifyDetail
 *
 * Atsevišķa "lapa" ar pilnu Spotify skatu: pa vidu griežas vinila disks
 * (ar albuma vāciņu tā centrā) un zem tā dziesmas nosaukums/garums; pa
 * kreisi vārdi, kas sinhroni izceļas ("live lyrics") atskaņošanas laikā,
 * pa labi rindā nākošās dziesmas.
 *
 * Dati (dziesma, rinda, vārdi) nāk no node_helper — skat. tā komentārus par
 * Spotify Web API un LRCLIB izmantošanu.
 */
Module.register("MMM-SpotifyDetail", {
	defaults: {
		updateInterval: 15 * 1000, // cik bieži vaicāt Spotify (ms)
		queueLimit: 5, // cik daudz nākamo dziesmu rādīt
		showLyrics: true,
		lyricsContextLines: 2 // cik rindas rādīt virs/zem pašreizējās
	},

	getStyles () {
		return ["font-awesome.css", "MMM-SpotifyDetail.css"];
	},

	start () {
		this.track = null; // { isPlaying, title, artist, album, albumArt, progressMs, durationMs }
		this.queue = [];
		this.lyrics = null; // masīvs / "instrumental" / false (nav atrasts) / null (nezināms)
		this.trackReceivedAt = 0;
		this.ticker = null;
		this.hasError = false;
		this.barFill = null;
		this.timeEl = null;
		this.lyricsListEl = null;
		this.activeLyricIndex = -1;
		this.wrapperEl = null;
		this.accentColor = null; // no albuma vāciņa iegūta akcentkrāsa (rgb(...))
		this.accentTrackId = null; // kurai dziesmai `accentColor` pieder

		// Akreditācijas datus (secrets.js) ielasa tikai node_helper — klientam tie netiek sūtīti.
		this.sendSocketNotification("SPOTIFY_DETAIL_CONFIG", this.config);
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "SPOTIFY_NO_CREDENTIALS") {
			this.hasError = "config";
			this.updateDom();
			return;
		}
		if (notification === "SPOTIFY_DETAIL_DATA") {
			this.hasError = false;
			const trackChanged = !this.sameTrack(this.track, payload.track);
			const queueChanged = this.queueSignature(this.queue) !== this.queueSignature(payload.queue || []);
			// Vārdi parasti nāk kopā ar jauno dziesmu, bet reizēm (piem. pēc
			// LRCLIB kļūdas) tie "iekrīt" vēlāk, kad dziesma jau nemainās.
			const lyricsArrived = this.lyrics === null && payload.lyrics !== null && payload.lyrics !== undefined;

			this.track = payload.track;
			this.queue = payload.queue || [];
			if (payload.lyrics !== undefined) this.lyrics = payload.lyrics;
			this.trackReceivedAt = Date.now();

			if (trackChanged) this.activeLyricIndex = -1;

			if (trackChanged || queueChanged || lyricsArrived) {
				// Kaut kas tiešām mainījies — pilna pārzīmēšana ir attaisnota.
				this.updateDom(trackChanged ? 500 : 200);
			} else {
				// Tā pati dziesma/rinda/vārdi — tikai klusi sinhronizējam progresu,
				// nevis pārzīmējam visu DOM (citādi vārdu saraksts katru poll()
				// reizi "atlektu" atpakaļ uz sākumu).
				this.renderProgress(this.currentProgressMs());
			}
			this.manageTicker();
		} else if (notification === "SPOTIFY_DETAIL_ERROR") {
			this.hasError = payload || true;
			this.updateDom(500);
		}
	},

	sameTrack (a, b) {
		if (!a && !b) return true;
		if (!a || !b) return false;
		return a.id === b.id;
	},

	queueSignature (queue) {
		return queue.map((t) => t.id).join(",");
	},

	currentProgressMs () {
		if (!this.track) return 0;
		let p = this.track.progressMs || 0;
		if (this.track.isPlaying) p += Date.now() - this.trackReceivedAt;
		return Math.min(p, this.track.durationMs || p);
	},

	manageTicker () {
		if (this.ticker) {
			clearInterval(this.ticker);
			this.ticker = null;
		}
		if (!this.track || !this.track.isPlaying) return;

		this.ticker = setInterval(() => {
			const progress = this.currentProgressMs();
			this.renderProgress(progress);
			this.renderActiveLyric(progress);
			if (this.track.durationMs && progress >= this.track.durationMs) {
				clearInterval(this.ticker);
				this.ticker = null;
			}
		}, 500);
	},

	renderProgress (progressMs) {
		if (!this.track || !this.track.durationMs || !this.barFill) return;
		const pct = Math.min(100, (progressMs / this.track.durationMs) * 100);
		this.barFill.style.width = `${pct}%`;
		if (this.timeEl) {
			this.timeEl.textContent = `${this.msToTime(progressMs)} / ${this.msToTime(this.track.durationMs)}`;
		}
	},

	/* Atrod pašreizējo vārdu rindu pēc progresa un pārzīmē tikai izcēlumu,
	 * nevis visu sarakstu — lai skats negrabinātos katru pusi sekundi. */
	renderActiveLyric (progressMs) {
		if (!this.lyricsListEl || !Array.isArray(this.lyrics)) return;
		let idx = -1;
		for (let i = 0; i < this.lyrics.length; i++) {
			if (this.lyrics[i].timeMs === null || this.lyrics[i].timeMs <= progressMs) idx = i;
			else break;
		}
		if (idx === this.activeLyricIndex) return;
		this.activeLyricIndex = idx;

		const rows = this.lyricsListEl.children;
		for (let i = 0; i < rows.length; i++) {
			rows[i].classList.toggle("sd-lyric-active", i === idx);
		}
		const activeRow = rows[idx];
		if (activeRow && activeRow.scrollIntoView) {
			activeRow.scrollIntoView({ block: "center", behavior: "smooth" });
		}
	},

	msToTime (ms) {
		const total = Math.max(0, Math.floor(ms / 1000));
		const m = Math.floor(total / 60);
		const s = String(total % 60).padStart(2, "0");
		return `${m}:${s}`;
	},

	// Iegūst dziesmas akcentkrāsu no albuma vāciņa — dod priekšroku piesātinātam
	// tonim (nevis pelēcīgam vidējam), lai josla/izcēlums izskatās pēc paša
	// vāciņa, nevis vienmēr zaļš. Ja attēlu neizdodas nolasīt (piem. CORS),
	// atgriež null un paliek noklusējuma Spotify zaļā.
	extractAccentColor (imgEl) {
		try {
			const size = 24;
			const canvas = document.createElement("canvas");
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			ctx.drawImage(imgEl, 0, 0, size, size);
			const { data } = ctx.getImageData(0, 0, size, size);

			let rSum = 0, gSum = 0, bSum = 0, count = 0;
			let best = null, bestScore = -1;
			for (let i = 0; i < data.length; i += 4) {
				const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
				if (a < 200) continue;
				rSum += r; gSum += g; bSum += b; count += 1;
				const max = Math.max(r, g, b), min = Math.min(r, g, b);
				const sat = max === 0 ? 0 : (max - min) / max;
				const score = sat * (max / 255);
				if (score > bestScore) { bestScore = score; best = [r, g, b]; }
			}
			if (!count) return null;

			let [r, g, b] = bestScore > 0.15 ? best : [rSum / count, gSum / count, bSum / count];
			// Pārāk tumšu akcentu paspilgtinām, lai josla/mirdzums uz tumša fona būtu redzams.
			const brightness = (r * 299 + g * 587 + b * 114) / 1000;
			if (brightness < 80) {
				const boost = 80 / Math.max(brightness, 1);
				r = Math.min(255, r * boost);
				g = Math.min(255, g * boost);
				b = Math.min(255, b * boost);
			}
			return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
		} catch (error) {
			return null; // CORS vai cita neveiksme — paliekam pie noklusējuma krāsas
		}
	},

	applyAccentForTrack (trackId, imgEl) {
		const apply = () => {
			const color = this.extractAccentColor(imgEl);
			if (!color) return;
			this.accentColor = color;
			this.accentTrackId = trackId;
			if (this.wrapperEl) this.wrapperEl.style.setProperty("--sd-accent", color);
		};
		if (imgEl.complete && imgEl.naturalWidth > 0) apply();
		else imgEl.addEventListener("load", apply, { once: true });
	},

	buildVinyl () {
		const vinyl = document.createElement("div");
		vinyl.className = "sd-vinyl";
		if (this.track && this.track.isPlaying) vinyl.classList.add("sd-vinyl-spinning");

		const grooves = document.createElement("div");
		grooves.className = "sd-vinyl-grooves";
		vinyl.appendChild(grooves);

		if (this.track && this.track.albumArt) {
			const label = document.createElement("img");
			label.className = "sd-vinyl-label";
			label.crossOrigin = "anonymous"; // vajadzīgs, lai canvas drīkstētu nolasīt akcentkrāsu
			label.onerror = () => {
				// Ja CORS režīmā attēls neielādējas, mēģinām vēlreiz bez tā —
				// vāciņam jāredzas vienmēr, pat ja akcentkrāsu iegūt neizdodas.
				if (label.crossOrigin !== null) {
					label.crossOrigin = null;
					label.onerror = null;
					label.src = this.track.albumArt;
				}
			};
			label.src = this.track.albumArt;
			vinyl.appendChild(label);

			if (this.accentTrackId === this.track.id && this.accentColor) {
				// Krāsa jau zināma no iepriekšējās pārzīmēšanas — uzreiz uzstādām.
				if (this.wrapperEl) this.wrapperEl.style.setProperty("--sd-accent", this.accentColor);
			} else {
				this.applyAccentForTrack(this.track.id, label);
			}
		} else {
			const label = document.createElement("div");
			label.className = "sd-vinyl-label sd-vinyl-label-empty";
			vinyl.appendChild(label);
		}

		const hole = document.createElement("div");
		hole.className = "sd-vinyl-hole";
		vinyl.appendChild(hole);

		return vinyl;
	},

	buildNowPlaying () {
		const box = document.createElement("div");
		box.className = "sd-now";

		const title = document.createElement("div");
		title.className = "sd-title bright";
		title.textContent = this.track.title;
		box.appendChild(title);

		const artist = document.createElement("div");
		artist.className = "sd-artist light";
		artist.textContent = this.track.artist;
		box.appendChild(artist);

		const album = document.createElement("div");
		album.className = "sd-album dimmed light xsmall";
		album.textContent = this.track.album;
		box.appendChild(album);

		if (this.track.durationMs) {
			const progress = this.currentProgressMs();

			const bar = document.createElement("div");
			bar.className = "sd-bar";
			this.barFill = document.createElement("div");
			this.barFill.className = "sd-bar-fill";
			this.barFill.style.width = `${Math.min(100, (progress / this.track.durationMs) * 100)}%`;
			bar.appendChild(this.barFill);
			box.appendChild(bar);

			this.timeEl = document.createElement("div");
			this.timeEl.className = "sd-time dimmed light xsmall";
			this.timeEl.textContent = `${this.msToTime(progress)} / ${this.msToTime(this.track.durationMs)}`;
			box.appendChild(this.timeEl);
		}

		return box;
	},

	buildQueue () {
		const box = document.createElement("div");
		box.className = "sd-queue";

		const heading = document.createElement("div");
		heading.className = "sd-heading dimmed light xsmall";
		heading.textContent = "NĀKAMĀS DZIESMAS";
		box.appendChild(heading);

		if (!this.queue.length) {
			const empty = document.createElement("div");
			empty.className = "sd-queue-empty dimmed light xsmall";
			empty.textContent = "Rinda tukša";
			box.appendChild(empty);
			return box;
		}

		const list = document.createElement("div");
		list.className = "sd-queue-list";
		for (const item of this.queue) {
			const row = document.createElement("div");
			row.className = "sd-queue-item";

			if (item.albumArt) {
				const img = document.createElement("img");
				img.className = "sd-queue-art";
				img.src = item.albumArt;
				row.appendChild(img);
			}

			const info = document.createElement("div");
			info.className = "sd-queue-info";
			const t = document.createElement("div");
			t.className = "sd-queue-title";
			t.textContent = item.title;
			info.appendChild(t);
			const a = document.createElement("div");
			a.className = "sd-queue-artist dimmed light xsmall";
			a.textContent = item.artist;
			info.appendChild(a);
			row.appendChild(info);

			list.appendChild(row);
		}
		box.appendChild(list);
		return box;
	},

	buildLyrics () {
		const box = document.createElement("div");
		box.className = "sd-lyrics";

		const heading = document.createElement("div");
		heading.className = "sd-heading dimmed light xsmall";
		heading.textContent = "VĀRDI";
		box.appendChild(heading);

		if (this.lyrics === "instrumental") {
			const msg = document.createElement("div");
			msg.className = "sd-lyrics-empty dimmed light xsmall";
			msg.textContent = "Instrumentāls skaņdarbs";
			box.appendChild(msg);
			return box;
		}
		if (this.lyrics === false) {
			const msg = document.createElement("div");
			msg.className = "sd-lyrics-empty dimmed light xsmall";
			msg.textContent = "Vārdi nav atrasti";
			box.appendChild(msg);
			return box;
		}
		if (!Array.isArray(this.lyrics) || !this.lyrics.length) {
			const msg = document.createElement("div");
			msg.className = "sd-lyrics-empty dimmed light xsmall";
			msg.textContent = this.lyrics === null ? "Ielādē vārdus…" : "Vārdi nav pieejami";
			box.appendChild(msg);
			return box;
		}

		this.lyricsListEl = document.createElement("div");
		this.lyricsListEl.className = "sd-lyrics-list";
		for (const line of this.lyrics) {
			const row = document.createElement("div");
			row.className = "sd-lyric-line";
			row.textContent = line.text || "♪";
			this.lyricsListEl.appendChild(row);
		}
		box.appendChild(this.lyricsListEl);
		// Uzreiz iestatām izcēlumu uz pareizo rindu (nevis gaidām nākamo tick).
		this.renderActiveLyric(this.currentProgressMs());

		return box;
	},

	buildPlaceholder (iconClass, text) {
		const box = document.createElement("div");
		box.className = "sd-placeholder";

		const ic = document.createElement("i");
		ic.className = `fa-solid ${iconClass} sd-placeholder-icon`;
		box.appendChild(ic);

		const msg = document.createElement("div");
		msg.className = "sd-placeholder-text dimmed light small";
		msg.textContent = text;
		box.appendChild(msg);

		return box;
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-spotifydetail";
		this.wrapperEl = wrapper;
		this.barFill = null;
		this.timeEl = null;
		this.lyricsListEl = null;

		if (this.hasError === "config") {
			wrapper.appendChild(this.buildPlaceholder("fa-triangle-exclamation", "Trūkst Spotify atslēgu (MagicMirror/secrets.js)"));
			return wrapper;
		}

		if (!this.track) {
			wrapper.appendChild(this.buildPlaceholder("fa-music", "Spotify: nekas neskan"));
			return wrapper;
		}

		const layout = document.createElement("div");
		layout.className = "sd-layout";
		if (!this.config.showLyrics) layout.classList.add("sd-no-lyrics");

		if (this.config.showLyrics) layout.appendChild(this.buildLyrics());

		const center = document.createElement("div");
		center.className = "sd-center";
		const nowHeading = document.createElement("div");
		nowHeading.className = "sd-heading dimmed light xsmall";
		nowHeading.textContent = "TAGAD SPĒLĒ";
		center.appendChild(nowHeading);
		center.appendChild(this.buildVinyl());
		center.appendChild(this.buildNowPlaying());
		layout.appendChild(center);

		layout.appendChild(this.buildQueue());

		wrapper.appendChild(layout);
		return wrapper;
	},

	stop () {
		if (this.ticker) clearInterval(this.ticker);
	}
});
