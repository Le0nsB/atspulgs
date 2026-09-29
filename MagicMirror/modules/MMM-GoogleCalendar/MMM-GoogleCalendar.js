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
 *
 * Atgādinājumi: `reminderMinutes` pirms notikuma sākuma (un visas dienas
 * notikumiem — tās dienas rītā `allDayReminderTime`) parāda paziņojumu caur
 * `alert` moduli un pārraida CALENDAR_REMINDER (pamodina ekrānsaudzētāju).
 */
Module.register("MMM-GoogleCalendar", {
	defaults: {
		updateInterval: 60 * 1000, // izmaiņas Google kalendārā parādās ~minūtes laikā bez restarta
		maximumNumberOfDays: 60, // cik tālu uz priekšu ielādēt (der arī MMM-MonthCalendar)
		maxUpcoming: 5, // cik notikumus rādīt paša moduļa sarakstā
		icsUpdateInterval: 5 * 60 * 1000, // Outlook/ICS kalendāru aptaujas biežums (secrets.js calendarFeeds)
		reminderMinutes: [15], // atgādināt tik minūtes pirms sākuma ([] = izslēgts)
		allDayReminderTime: "08:00", // visas dienas notikumiem ("" = neatgādināt)
		reminderDuration: 20 * 1000 // cik ilgi paziņojums redzams
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
		// Dati pienāk tikai, kad kalendārā kas mainās, tāpēc "Tagad"/"Šodien"
		// un beigušos notikumu pazušanu pārzīmējam paši reizi minūtē.
		setInterval(() => {
			if (!this.pairing && this.events.length) this.updateDom();
		}, 60 * 1000);
		this.reminded = new Set();
		setInterval(() => this.checkReminders(), 30 * 1000);
	},

	// Atgriež notikumus, par kuriem TAGAD jāatgādina (katru tikai vienreiz).
	dueReminders (now = Date.now()) {
		if (!this.reminded) this.reminded = new Set();
		const due = [];
		const minutes = Array.isArray(this.config.reminderMinutes) ? this.config.reminderMinutes : [this.config.reminderMinutes];
		for (const e of this.events) {
			if (e.fullDayEvent) {
				const m = /^(\d{1,2}):(\d{2})$/.exec(this.config.allDayReminderTime || "");
				if (!m) continue;
				const d = new Date(e.startDate);
				const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(m[1]), Number(m[2])).getTime();
				// Tikai tās dienas laikā (ne, ja spogulis ieslēgts vakarā pēc notikuma).
				const key = `${e.id}:${e.startDate}:day`;
				if (now >= at && now < at + 4 * 60 * 60 * 1000 && !this.reminded.has(key)) due.push({ key, event: e, minutes: null });
				continue;
			}
			for (const min of minutes) {
				if (!(min >= 0)) continue;
				const at = e.startDate - min * 60 * 1000;
				const key = `${e.id}:${e.startDate}:${min}`;
				if (now >= at && now < e.startDate && !this.reminded.has(key)) due.push({ key, event: e, minutes: min });
			}
		}
		return due;
	},

	checkReminders () {
		if (this.pairing) return;
		for (const { key, event } of this.dueReminders()) {
			this.reminded.add(key);
			const when = this.formatWhen(event);
			this.sendNotification("CALENDAR_REMINDER", event);
			this.sendNotification("SHOW_ALERT", {
				type: "notification",
				title: `<i class="fa fa-bell"></i> ${event.fullDayEvent ? "Šodien" : "Atgādinājums"}`,
				message: event.fullDayEvent ? event.title : `${event.title} — ${when}`,
				messageType: "text", // notikuma nosaukums nāk no kalendāra — nerādām kā HTML
				timer: this.config.reminderDuration
			});
		}
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
				this.checkReminders();
				break;
			case "GCAL_PHONE_LINK":
				// Telefona lapas adrese + QR kods — rāda MMM-CalendarAgenda.
				this.sendNotification("CALENDAR_PHONE_LINK", payload);
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

	// "Tagad" / "Šodien 14:00" / "Rīt" / "Pk 2.10. 18:30" — lai uzreiz redz,
	// cik tālu notikums ir, nevis jāpārrēķina datums galvā.
	formatWhen (e, now = new Date()) {
		if (e.startDate <= now.getTime() && e.endDate > now.getTime()) return "Tagad";
		const d = new Date(e.startDate);
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		const diff = Math.round((day - today) / (24 * 60 * 60 * 1000));
		let datePart;
		if (diff === 0) datePart = "Šodien";
		else if (diff === 1) datePart = "Rīt";
		else if (diff === 2) datePart = "Parīt";
		else {
			const wd = ["Sv", "Pr", "Ot", "Tr", "Ce", "Pk", "Se"][d.getDay()];
			datePart = `${wd} ${d.getDate()}.${d.getMonth() + 1}.`;
		}
		if (e.fullDayEvent) return datePart;
		const timePart = d.toLocaleTimeString("lv-LV", { hour: "2-digit", minute: "2-digit" });
		return `${datePart} ${timePart}`;
	}
});
