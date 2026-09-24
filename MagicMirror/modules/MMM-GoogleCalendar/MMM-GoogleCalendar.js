/* MagicMirror² Module: MMM-GoogleCalendar
 *
 * Pieslēdz personīgo Google Calendar ar OAuth "device authorization"
 * plūsmu: kamēr nav pieslēgts, modulis rāda kodu un adresi
 * (google.com/device) — jebkurš var to ievadīt SAVĀ tālrunī, nekas nav
 * jārediģē failos. Skat. node_helper.js par to, kā tas strādā un kāpēc
 * klienta atslēgas (Client ID/secret) tik un tā jāuzstāda vienreiz
 * administratoram (secrets.js), bet pats pieslēgšanās solis ir vienkāršs.
 *
 * Pēc pieslēgšanās rāda tuvākos notikumus UN pārraida tos kā
 * `CALENDAR_EVENTS` (tāpat kā iebūvētais `calendar` modulis), tāpēc tie
 * automātiski parādās arī MMM-MonthCalendar mēneša skatā.
 */
Module.register("MMM-GoogleCalendar", {
	defaults: {
		updateInterval: 15 * 60 * 1000, // personīgais kalendārs mainās retāk nekā, piem., Spotify
		maximumNumberOfDays: 60, // cik tālu uz priekšu ielādēt (der arī MMM-MonthCalendar)
		maxUpcoming: 5 // cik notikumus rādīt paša moduļa sarakstā
	},

	getStyles () {
		return ["MMM-GoogleCalendar.css"];
	},

	start () {
		this.events = [];
		this.hasError = false;
		this.pairing = null; // { userCode, verificationUrl, expiresAt }
		this.pairingError = null;
		this.sendSocketNotification("GCAL_CONFIG", this.config);
	},

	socketNotificationReceived (notification, payload) {
		switch (notification) {
			case "GCAL_NO_CLIENT":
				this.hasError = "client";
				this.updateDom();
				break;
			case "GCAL_PAIRING_CODE":
				this.pairing = payload;
				this.pairingError = null;
				this.hasError = false;
				this.updateDom();
				break;
			case "GCAL_PAIRING_DONE":
				this.pairing = null;
				this.pairingError = null;
				this.updateDom();
				break;
			case "GCAL_PAIRING_ERROR":
				this.pairingError = payload;
				this.updateDom();
				break;
			case "GCAL_DATA":
				this.hasError = false;
				this.events = payload || [];
				// Tāpat kā iebūvētais `calendar` modulis — ļauj MMM-MonthCalendar
				// (un jebkuram citam klausītājam) izmantot šos notikumus.
				this.sendNotification("CALENDAR_EVENTS", this.events);
				this.updateDom(300);
				break;
			case "GCAL_ERROR":
				this.hasError = payload || true;
				this.updateDom(300);
				break;
			default:
				break;
		}
	},

	upcoming () {
		const now = Date.now();
		return this.events
			.filter((e) => e.endDate >= now)
			.slice(0, this.config.maxUpcoming);
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-googlecalendar";

		if (this.hasError === "client") {
			wrapper.className += " gcal-config-error";
			wrapper.innerText = "MMM-GoogleCalendar: nav iestatīts Google OAuth klients (secrets.js) — skat. moduļa README.md";
			return wrapper;
		}

		if (this.pairing) {
			wrapper.appendChild(this.buildPairing());
			return wrapper;
		}

		const items = this.upcoming();
		const list = document.createElement("ul");
		list.className = "gcal-list";

		if (!items.length) {
			const empty = document.createElement("li");
			empty.className = "gcal-empty";
			empty.innerText = "Nekā tuvākajā laikā";
			list.appendChild(empty);
		} else {
			items.forEach((e) => list.appendChild(this.buildItem(e)));
		}
		wrapper.appendChild(list);

		if (this.hasError) {
			const err = document.createElement("div");
			err.className = "gcal-error-note";
			err.innerText = "Kalendārs nav sasniedzams";
			wrapper.appendChild(err);
		}

		return wrapper;
	},

	buildPairing () {
		const box = document.createElement("div");
		box.className = "gcal-pairing";

		const title = document.createElement("div");
		title.className = "gcal-pairing-title";
		title.innerText = "Pieslēdz Google kalendāru";
		box.appendChild(title);

		const step = document.createElement("div");
		step.className = "gcal-pairing-step";
		step.innerText = "Tālrunī vai datorā atver:";
		box.appendChild(step);

		const url = document.createElement("div");
		url.className = "gcal-pairing-url";
		url.innerText = this.pairing.verificationUrl || "google.com/device";
		box.appendChild(url);

		const step2 = document.createElement("div");
		step2.className = "gcal-pairing-step";
		step2.innerText = "un ievadi kodu:";
		box.appendChild(step2);

		const code = document.createElement("div");
		code.className = "gcal-pairing-code";
		code.innerText = this.pairing.userCode;
		box.appendChild(code);

		if (this.pairingError) {
			const err = document.createElement("div");
			err.className = "gcal-pairing-error";
			err.innerText = "Kļūda — mēģina vēlreiz…";
			box.appendChild(err);
		}

		return box;
	},

	buildItem (e) {
		const li = document.createElement("li");
		li.className = "gcal-item";

		const when = document.createElement("span");
		when.className = "gcal-when";
		when.innerText = this.formatWhen(e);
		li.appendChild(when);

		const title = document.createElement("span");
		title.className = "gcal-title";
		title.innerText = e.title;
		li.appendChild(title);

		return li;
	},

	formatWhen (e) {
		const d = new Date(e.startDate);
		const datePart = d.toLocaleDateString("lv-LV", { day: "numeric", month: "numeric" });
		if (e.fullDayEvent) return datePart;
		const timePart = d.toLocaleTimeString("lv-LV", { hour: "2-digit", minute: "2-digit" });
		return `${datePart} ${timePart}`;
	}
});
