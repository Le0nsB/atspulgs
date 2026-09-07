/* MagicMirror² Module: MMM-MonthCalendar
 *
 * Rāda tekošā mēneša kalendāru režģī. Katrā datumā parādīta arī tās
 * dienas vārda diena(s). Vārdu dati tiek ņemti no MMM-Namedays moduļa
 * (namedays.data.js) — pilnībā lokāli, internets nav vajadzīgs.
 *
 * Ja dienā ir svētki (notikums no `calendar` moduļa, piem. Brīvdienas
 * Latvijā), tie tiek parādīti zem datuma.
 */
Module.register("MMM-MonthCalendar", {
	defaults: {
		firstDayOfWeek: 1, // 1 = pirmdiena
		useExtended: false, // saskaņā ar MMM-Namedays
		maxNamesPerDay: 2,
		showNamedays: true,
		showHolidays: true, // rādīt svētkus no `calendar` moduļa
		maxHolidaysPerDay: 2,
		updateOnMidnight: true,
		weekdayLabels: ["Pr", "Ot", "Tr", "Ce", "Pk", "Se", "Sv"],
		monthLabels: [
			"Janvāris", "Februāris", "Marts", "Aprīlis", "Maijs", "Jūnijs",
			"Jūlijs", "Augusts", "Septembris", "Oktobris", "Novembris", "Decembris"
		]
	},

	getStyles () {
		return ["MMM-MonthCalendar.css"];
	},

	getScripts () {
		return [this.file("../MMM-Namedays/namedays.data.js")];
	},

	start () {
		if (this.config.showNamedays && !window.MMM_NAMEDAYS_DATA) {
			Log.warn("MMM-MonthCalendar: nav ielādēti vārda dienu dati "
				+ "(../MMM-Namedays/namedays.data.js). Vai MMM-Namedays ir instalēts? "
				+ "Kalendārs rādīsies bez vārdiem.");
		}
		const data = window.MMM_NAMEDAYS_DATA || { traditional: {}, extended: {} };
		this.namedays = this.config.useExtended ? data.extended : data.traditional;
		this.holidays = {}; // "YYYY-M-D" -> [nosaukumi]
		this.eventsBySender = {}; // katra `calendar` instance sūta savu sarakstu
		if (this.config.updateOnMidnight) this.scheduleMidnightUpdate();
	},

	// Notikumi no `calendar` moduļa (Brīvdienas Latvijā u.c.). Var būt vairākas
	// `calendar` instances — apvienojam visu un noņemam dublikātus.
	notificationReceived (notification, payload, sender) {
		if (notification !== "CALENDAR_EVENTS" || !this.config.showHolidays) return;
		if (!Array.isArray(payload)) return;

		const key = sender && sender.identifier ? sender.identifier : "default";
		this.eventsBySender[key] = payload;

		const DAY = 24 * 60 * 60 * 1000;
		const isUtcMidnight = (ms) => {
			const d = new Date(ms);
			return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
		};

		const byDay = {};
		Object.values(this.eventsBySender).forEach((events) => {
			events.forEach((event) => {
				if (!event || !event.startDate) return;
				const startMs = Number(event.startDate);
				let endMs = event.endDate ? Number(event.endDate) : startMs;
				// iCal visas dienas notikumiem beigu datums ir IZSLĒDZOŠS
				// (piem. svētdienas svētki beidzas pirmdienā 00:00), tāpēc
				// atņemam vienu dienu, lai neieķeksētu nākamo dienu.
				const allDay = event.fullDayEvent || (isUtcMidnight(startMs) && isUtcMidnight(endMs));
				if (allDay && endMs > startMs) endMs -= DAY;

				const start = new Date(startMs);
				const last = new Date(endMs);
				const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
				const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
				let guard = 0;
				while (cursor <= lastDay && guard < 40) {
					const dayKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
					const title = event.title || "";
					const list = (byDay[dayKey] = byDay[dayKey] || []);
					if (!list.includes(title)) list.push(title);
					cursor.setDate(cursor.getDate() + 1);
					guard++;
				}
			});
		});
		this.holidays = byDay;
		this.updateDom(300);
	},

	scheduleMidnightUpdate () {
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30);
		setTimeout(() => {
			this.updateDom(1000);
			this.scheduleMidnightUpdate();
		}, next - now);
	},

	namesFor (month, day) {
		const key = `${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		return this.namedays[key] || [];
	},

	holidaysFor (year, month, day) {
		return this.holidays[`${year}-${month}-${day}`] || [];
	},

	getDom () {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth();
		const today = now.getDate();

		const wrapper = document.createElement("div");
		wrapper.className = "mmm-monthcalendar";

		const title = document.createElement("div");
		title.className = "mc-title";
		title.textContent = `${this.config.monthLabels[month]} ${year}`;
		wrapper.appendChild(title);

		const grid = document.createElement("div");
		grid.className = "mc-grid";

		// Nedēļas dienu galvenes.
		const order = [];
		for (let i = 0; i < 7; i++) {
			order.push((this.config.firstDayOfWeek + i) % 7);
		}
		order.forEach((dow) => {
			const head = document.createElement("div");
			head.className = "mc-weekday dimmed";
			head.textContent = this.config.weekdayLabels[(dow + 6) % 7];
			grid.appendChild(head);
		});

		// Tukšās šūnas pirms mēneša pirmās dienas.
		const firstDow = new Date(year, month, 1).getDay();
		let lead = (firstDow - this.config.firstDayOfWeek + 7) % 7;
		for (let i = 0; i < lead; i++) {
			const empty = document.createElement("div");
			empty.className = "mc-day mc-empty";
			grid.appendChild(empty);
		}

		const daysInMonth = new Date(year, month + 1, 0).getDate();
		for (let d = 1; d <= daysInMonth; d++) {
			const cell = document.createElement("div");
			cell.className = "mc-day";
			if (d === today) cell.className += " mc-today";

			const holidays = this.config.showHolidays ? this.holidaysFor(year, month, d) : [];
			if (holidays.length) cell.className += " mc-has-holiday";

			const num = document.createElement("div");
			num.className = "mc-num";
			num.textContent = d;
			cell.appendChild(num);

			if (this.config.showNamedays) {
				const names = this.namesFor(month, d);
				if (names.length) {
					const nd = document.createElement("div");
					nd.className = "mc-names dimmed";
					nd.textContent = names.slice(0, this.config.maxNamesPerDay).join(", ");
					cell.appendChild(nd);
				}
			}

			if (holidays.length) {
				const hd = document.createElement("div");
				hd.className = "mc-holiday";
				hd.textContent = holidays.slice(0, this.config.maxHolidaysPerDay).join(" · ");
				cell.appendChild(hd);
			}

			grid.appendChild(cell);
		}

		wrapper.appendChild(grid);
		return wrapper;
	}
});
