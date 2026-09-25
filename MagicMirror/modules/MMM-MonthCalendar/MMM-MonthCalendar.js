/* MagicMirror² Module: MMM-MonthCalendar
 *
 * Rāda tekošā mēneša kalendāru režģī. Katrā datumā parādīta arī tās
 * dienas vārda diena(s). Vārdu dati tiek ņemti no MMM-Namedays moduļa
 * (namedays.data.js) — pilnībā lokāli, internets nav vajadzīgs.
 *
 * Ja dienā ir svētki (notikums no `calendar` moduļa, piem. Brīvdienas
 * Latvijā), tie tiek parādīti zem datuma. Personīgie notikumi (no
 * MMM-GoogleCalendar, skat. `personalSources`) tiek rādīti atsevišķi, zilā
 * krāsā un ar laiku. Mēneša beigās režģis turpinās ar nākamā mēneša
 * dienām, lai vienmēr redz vismaz nedēļu uz priekšu.
 */
Module.register("MMM-MonthCalendar", {
	defaults: {
		firstDayOfWeek: 1, // 1 = pirmdiena
		useExtended: false, // saskaņā ar MMM-Namedays
		maxNamesPerDay: 4,
		showNamedays: true,
		showHolidays: true, // rādīt svētkus no `calendar` moduļa
		maxHolidaysPerDay: 2,
		personalSources: ["MMM-GoogleCalendar"], // moduļi, kuru notikumi ir "mani plāni", ne svētki
		maxPersonalPerDay: 2,
		minDaysAhead: 7, // cik dienas pēc šodienas vienmēr redzamas (arī nākamajā mēnesī)
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
		this.personal = {}; // "YYYY-M-D" -> [{ title, time }]
		this.sendersPersonal = {}; // identifier -> vai sūtītājs ir personīgais kalendārs
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
		this.sendersPersonal[key] = !!(sender && this.config.personalSources.includes(sender.name));

		const DAY = 24 * 60 * 60 * 1000;
		const isUtcMidnight = (ms) => {
			const d = new Date(ms);
			return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
		};

		const byDay = {};
		const personalByDay = {};
		Object.entries(this.eventsBySender).forEach(([senderKey, events]) => {
			const personal = this.sendersPersonal[senderKey];
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
					if (personal) {
						// Laiku rāda tikai sākuma dienā; visas dienas / turpinājuma dienās bez laika.
						const sameDay = cursor.getTime() === new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
						const time = !allDay && sameDay
							? start.toLocaleTimeString("lv-LV", { hour: "2-digit", minute: "2-digit" })
							: "";
						const list = (personalByDay[dayKey] = personalByDay[dayKey] || []);
						if (!list.some((p) => p.title === title && p.time === time)) list.push({ title, time, sort: allDay ? 0 : startMs });
					} else {
						const list = (byDay[dayKey] = byDay[dayKey] || []);
						if (!list.includes(title)) list.push(title);
					}
					cursor.setDate(cursor.getDate() + 1);
					guard++;
				}
			});
		});
		Object.values(personalByDay).forEach((list) => list.sort((a, b) => a.sort - b.sort));
		this.holidays = byDay;
		this.personal = personalByDay;
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

	personalFor (year, month, day) {
		return this.personal[`${year}-${month}-${day}`] || [];
	},

	// Cik nākamā mēneša dienu pievienot režģa beigās: vismaz līdz nedēļas
	// beigām, un tik, lai pēc šodienas būtu redzamas `minDaysAhead` dienas.
	trailingDays (year, month, today) {
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const lastDow = new Date(year, month, daysInMonth).getDay();
		const lastWeekday = (this.config.firstDayOfWeek + 6) % 7;
		let extra = (lastWeekday - lastDow + 7) % 7;
		const needed = this.config.minDaysAhead - (daysInMonth - today);
		while (extra < needed) extra += 7;
		return extra;
	},

	buildCell (date, { isToday, isNext }) {
		const year = date.getFullYear();
		const month = date.getMonth();
		const d = date.getDate();
		const cell = document.createElement("div");
		cell.className = "mc-day";
		if (isToday) cell.className += " mc-today";
		if (isNext) cell.className += " mc-next";

		const holidays = this.config.showHolidays ? this.holidaysFor(year, month, d) : [];
		if (holidays.length) cell.className += " mc-has-holiday";
		const personal = this.config.showHolidays ? this.personalFor(year, month, d) : [];
		if (personal.length) cell.className += " mc-has-personal";

		const num = document.createElement("div");
		num.className = "mc-num";
		// Nākamā mēneša 1. datumam pieliek mēnesi, lai nesajauc ar šī mēneša 1.
		num.textContent = isNext && d === 1 ? `${d}. ${this.config.monthLabels[month].slice(0, 3).toLowerCase()}` : d;
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

		if (personal.length) {
			const shown = personal.slice(0, this.config.maxPersonalPerDay);
			shown.forEach((p) => {
				const pe = document.createElement("div");
				pe.className = "mc-personal";
				pe.textContent = p.time ? `${p.time} ${p.title}` : p.title;
				cell.appendChild(pe);
			});
			if (personal.length > shown.length) {
				const more = document.createElement("div");
				more.className = "mc-personal mc-more";
				more.textContent = `+${personal.length - shown.length}`;
				cell.appendChild(more);
			}
		}

		if (holidays.length) {
			const hd = document.createElement("div");
			hd.className = "mc-holiday";
			hd.textContent = holidays.slice(0, this.config.maxHolidaysPerDay).join(" · ");
			cell.appendChild(hd);
		}

		return cell;
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
			grid.appendChild(this.buildCell(new Date(year, month, d), { isToday: d === today }));
		}

		const trailing = this.trailingDays(year, month, today);
		for (let i = 1; i <= trailing; i++) {
			grid.appendChild(this.buildCell(new Date(year, month + 1, i), { isNext: true }));
		}

		wrapper.appendChild(grid);
		return wrapper;
	}
});
