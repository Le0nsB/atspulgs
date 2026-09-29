/* MagicMirror² Module: MMM-Radio
 *
 * Interneta radio ar balss/žestu vadību. Skaņu atskaņo TIKAI spoguļa
 * Electron logs (Pi -> TV skaļruņi), ne MacBook/telefons, kas atvēris to pašu
 * lapu (config `playOn`). Stāvoklis (stacija, skan/neskan, dziesma) dzīvo
 * node_helper, tāpēc visi klienti rāda to pašu.
 *
 * Notifikācijas (balss komandas / žesti / citi moduļi):
 *   RADIO_PLAY [indekss]  RADIO_STOP  RADIO_TOGGLE  RADIO_NEXT  RADIO_PREV
 *   RADIO_PLAY_NAMED { text: "star fm" }
 * Spotify un radio neskan vienlaikus: radio ieslēdzot, Spotify tiek
 * apturēts (ja skan); "apturi mūziku" / Spotify ieslēgšana aptur radio.
 */
Module.register("MMM-Radio", {
	defaults: {
		// Pārbaudītas tiešās straumes (MP3/AAC). HLS (.m3u8) Electron <audio> neatskaņo.
		stations: [
			{ name: "Radio SWH", url: "https://live.radioswh.lv:8443/swh_lv", aliases: ["swh", "es ve ha", "esvēhā", "radio svh"] },
			{ name: "Star FM", url: "https://live.advailo.com/audio/mp3/icecast.audio", aliases: ["starfm", "stārs"] },
			{ name: "Radio Skonto", url: "https://stream.radioskonto.lv:8443/stereo", aliases: ["skonto"] },
			{ name: "Retro FM", url: "https://stream.ehrhiti.lv:8000/Stream_RE.aac", aliases: ["retro"] },
			{ name: "XO.FM", url: "https://live.xo.fm/xofm128", aliases: ["xo", "ikso", "iksou"] },
			{ name: "Chillax", url: "https://streams.chillaxfm.lv/chillax", aliases: ["čilakss", "chill"] }
		],
		playOn: "electron", // "electron" = tikai spoguļa logs; "all" = katrs klients
		volume: 0.8, // 0..1
		volumeStep: 0.1,
		pauseSpotify: true, // radio ieslēdzot, apturēt Spotify (ja tas skan)
		showTrack: true, // rādīt dziesmu no straumes metadatiem (ICY)
		metadataInterval: 30 * 1000
	},

	getStyles () {
		return ["font-awesome.css", "MMM-Radio.css"];
	},

	start () {
		this.state = { playing: false, index: 0, station: null, track: null };
		this.message = null;
		this.spotifyPlaying = false;
		this.volume = this.config.volume;
		this.isPlayer = this.config.playOn === "all"
			|| (typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent));
		this.audio = null;
		this.sendSocketNotification("RADIO_CONFIG", {
			stations: this.config.stations,
			showTrack: this.config.showTrack,
			metadataInterval: this.config.metadataInterval
		});
	},

	notificationReceived (notification, payload) {
		switch (notification) {
			case "RADIO_PLAY": this.cmd("play", Number.isInteger(payload) ? payload : undefined); break;
			case "RADIO_STOP": this.cmd("stop"); break;
			case "RADIO_TOGGLE": this.cmd("toggle"); break;
			case "RADIO_NEXT": this.cmd("next"); break;
			case "RADIO_PREV": this.cmd("prev"); break;
			case "RADIO_PLAY_NAMED":
				if (payload && payload.text) this.cmd("play_named", payload.text);
				else this.cmd("play");
				break;
			// Mūzikas komandas attiecas arī uz radio, kad tas skan.
			case "SPOTIFY_PAUSE":
			case "SPOTIFY_PLAY":
				if (this.state.playing) this.cmd("stop");
				break;
			case "SPOTIFY_VOLUME_UP":
			case "SPOTIFY_VOLUME_DOWN":
				if (this.state.playing) this.changeVolume(notification === "SPOTIFY_VOLUME_UP" ? 1 : -1);
				break;
			case "SPOTIFY_STATE":
				this.spotifyPlaying = Boolean(payload && payload.isPlaying);
				break;
			default:
				break;
		}
	},

	cmd (action, value) {
		this.sendSocketNotification("RADIO_CMD", { action, value });
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "RADIO_STATE") {
			const wasPlaying = this.state.playing;
			const oldUrl = this.state.station && this.state.station.url;
			this.state = payload;
			if (this.isPlayer) this.syncAudio(oldUrl);
			if (payload.playing && !wasPlaying && this.isPlayer && this.config.pauseSpotify && this.spotifyPlaying) {
				this.sendNotification("SPOTIFY_PAUSE");
			}
			this.updateDom(300);
		} else if (notification === "RADIO_NOT_FOUND") {
			this.flash(`Nav tādas stacijas: „${payload}"`);
		} else if (notification === "RADIO_FAILED") {
			this.flash(`${payload} pašlaik nav pieejams`);
		}
	},

	flash (text) {
		this.message = text;
		this.updateDom(200);
		clearTimeout(this.messageTimer);
		this.messageTimer = setTimeout(() => {
			this.message = null;
			this.updateDom(300);
		}, 5000);
	},

	/* ------------------------------ atskaņošana ------------------------------ */

	syncAudio (oldUrl) {
		const { playing, station, index } = this.state;
		if (!playing || !station) {
			if (this.audio) {
				this.audio.pause();
				this.audio.removeAttribute("src"); // pārtrauc straumes lejupielādi
				this.audio.load();
			}
			return;
		}
		if (!this.audio) {
			this.audio = new Audio();
			this.audio.preload = "none";
			this.audio.addEventListener("error", () => {
				// Straume nav pieejama — ziņojam serverim (tas izslēdz visiem klientiem).
				if (this.state.playing) this.cmd("failed", this.state.index);
			});
		}
		this.audio.volume = this.volume;
		if (oldUrl === station.url && !this.audio.paused) return;
		this.audio.src = station.url;
		const started = this.audio.play();
		if (started && started.catch) {
			started.catch((err) => {
				if (err && err.name === "AbortError") return; // stacija nomainīta, kamēr ielādējās
				Log.error(`MMM-Radio: neizdevās atskaņot ${station.name}: ${err && err.message}`);
				this.cmd("failed", index);
			});
		}
	},

	changeVolume (direction) {
		this.volume = Math.max(0, Math.min(1, Math.round((this.volume + direction * this.config.volumeStep) * 100) / 100));
		if (this.audio) this.audio.volume = this.volume;
		this.flash(`Skaļums ${Math.round(this.volume * 100)}%`);
	},

	/* --------------------------------- ekrāns --------------------------------- */

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-radio";
		const { playing, station, track } = this.state;

		if (!playing && !this.message) {
			wrapper.classList.add("radio-hidden");
			return wrapper;
		}

		if (playing && station) {
			const icon = document.createElement("div");
			icon.className = "radio-icon";
			if (station.logo) {
				const img = document.createElement("img");
				img.src = station.logo;
				img.alt = "";
				icon.appendChild(img);
			} else {
				icon.innerHTML = "<i class=\"fa fa-radio\"></i>";
			}
			wrapper.appendChild(icon);

			const info = document.createElement("div");
			info.className = "radio-info";

			const name = document.createElement("div");
			name.className = "radio-station small bright";
			name.textContent = station.name;
			const eq = document.createElement("span");
			eq.className = "radio-eq";
			eq.innerHTML = "<i></i><i></i><i></i>";
			name.appendChild(eq);
			info.appendChild(name);

			if (this.config.showTrack && track && track.title) {
				const t = document.createElement("div");
				t.className = "radio-title small";
				t.textContent = track.title;
				info.appendChild(t);
				if (track.artist) {
					const a = document.createElement("div");
					a.className = "radio-artist xsmall dimmed";
					a.textContent = track.artist;
					info.appendChild(a);
				}
			} else {
				const t = document.createElement("div");
				t.className = "radio-artist xsmall dimmed";
				t.textContent = "Tiešraide";
				info.appendChild(t);
			}
			wrapper.appendChild(info);
		}

		if (this.message) {
			const msg = document.createElement("div");
			msg.className = "radio-message xsmall dimmed";
			msg.textContent = this.message;
			wrapper.appendChild(msg);
		}
		return wrapper;
	}
});
