/* MagicMirror² Module: MMM-CalendarAgenda
 *
 * Pilnas lapas "darba kārtība": Google kalendāra plānotie notikumi
 * nākamajām dienām, sagrupēti pa dienām ("Šodien", "Rīt", "Pirmdiena,
 * 28. septembris · pēc 3 d."), lai jau laikus redz, kas gaidāms.
 *
 * Pats neko neielādē — klausās `CALENDAR_EVENTS`, ko pārraida
 * MMM-GoogleCalendar (tur ir arī Google pieslēgšanās). Tāpēc nav otras
 * OAuth sesijas un otras API aptaujas.
 */
Module.register("MMM-CalendarAgenda", {
	defaults: {
		daysAhead: 14, // cik dienas uz priekšu rādīt
		maxEntries: 14, // kopējais rindu skaits, lai saraksts ietilpst ekrānā
		sources: ["MMM-GoogleCalendar"], // kuru moduļu CALENDAR_EVENTS rādīt
		header: "Plānotais",
		weekdayNames: ["svētdiena", "pirmdiena", "otrdiena", "trešdiena", "ceturtdiena", "piektdiena", "sestdiena"],
		monthNames: [
			"janvāris", "februāris", "marts", "aprīlis", "maijs", "jūnijs",
			"jūlijs", "augusts", "septembris", "oktobris", "novembris", "decembris"
		]
	},

	getStyles () {
		return ["MMM-CalendarAgenda.css"];
	},

	start () {
		this.events = null; // null = vēl nav saņemti dati
		// Pārzīmē reizi minūtē: "notiek tagad", beigušies notikumi pazūd,
		// pusnaktī "Rīt" kļūst par "Šodien".
		setInterval(() => this.updateDom(), 60 * 1000);
	},

	notificationReceived (notification, payload, sender) {
		if (notification !== "CALENDAR_EVENTS" || !Array.isArray(payload)) return;
		if (!sender || !this.config.sources.includes(sender.name)) return;
		this.events = payload;
		this.updateDom(300);
	},

	// Atgriež [{ date, events: [...] }] tikai tām dienām, kurās kaut kas ir.
	// Vairāku dienu notikums parādās katrā savā dienā.
	groupByDay (now = new Date()) {
		const DAY = 24 * 60 * 60 * 1000;
		const nowMs = now.getTime();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const days = [];
		let count = 0;

		for (let i = 0; i < this.config.daysAhead && count < this.config.maxEntries; i++) {
			const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
			const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i + 1);
			const events = (this.events || [])
				.filter((e) => {
					const start = Number(e.startDate);
					let end = Number(e.endDate || e.startDate);
					if (end <= start) end = start + (e.fullDayEvent ? DAY : 1);
					return start < dayEnd.getTime() && end > dayStart.getTime() && end > nowMs;
				})
				.sort((a, b) => (b.fullDayEvent - a.fullDayEvent) || (a.startDate - b.startDate))
				.slice(0, this.config.maxEntries - count);
			if (events.length) {
				days.push({ date: dayStart, offset: i, events });
				count += events.length;
			}
		}
		return days;
	},

	dayLabel (date, offset) {
		const name = `${this.config.weekdayNames[date.getDay()]}, ${date.getDate()}. ${this.config.monthNames[date.getMonth()]}`;
		if (offset === 0) return { main: "Šodien", sub: name };
		if (offset === 1) return { main: "Rīt", sub: name };
		return { main: name.charAt(0).toUpperCase() + name.slice(1), sub: `pēc ${offset} d.` };
	},

	timeLabel (e, date, now) {
		const fmt = (ms) => new Date(ms).toLocaleTimeString("lv-LV", { hour: "2-digit", minute: "2-digit" });
		const start = Number(e.startDate);
		const end = Number(e.endDate || e.startDate);
		if (start <= now.getTime() && end > now.getTime()) return { text: "Tagad", now: true };
		if (e.fullDayEvent) return { text: "Visu dienu" };
		// Vairāku dienu notikums, kas sākās agrāk — rāda, līdz kuram laikam ilgst.
		if (start < date.getTime()) return { text: `līdz ${fmt(end)}` };
		return { text: end > start ? `${fmt(start)}–${fmt(end)}` : fmt(start) };
	},

	getDom () {
		const now = new Date();
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-calendaragenda";

		const title = document.createElement("div");
		title.className = "ca-title";
		title.innerText = this.config.header;
		wrapper.appendChild(title);

		if (this.events === null) {
			const wait = document.createElement("div");
			wait.className = "ca-empty";
			wait.innerText = "Gaida kalendāra datus… (ja kalendārs nav pieslēgts, kods redzams sākumlapā)";
			wrapper.appendChild(wait);
			return wrapper;
		}

		const days = this.groupByDay(now);
		if (!days.length) {
			const empty = document.createElement("div");
			empty.className = "ca-empty";
			empty.innerText = `Nākamajās ${this.config.daysAhead} dienās nekas nav ieplānots`;
			wrapper.appendChild(empty);
			return wrapper;
		}

		days.forEach(({ date, offset, events }) => {
			const day = document.createElement("div");
			day.className = offset === 0 ? "ca-day ca-today" : "ca-day";

			const head = document.createElement("div");
			head.className = "ca-day-head";
			const label = this.dayLabel(date, offset);
			const main = document.createElement("span");
			main.className = "ca-day-main";
			main.innerText = label.main;
			head.appendChild(main);
			const sub = document.createElement("span");
			sub.className = "ca-day-sub";
			sub.innerText = label.sub;
			head.appendChild(sub);
			day.appendChild(head);

			const list = document.createElement("ul");
			list.className = "ca-list";
			events.forEach((e) => {
				const li = document.createElement("li");
				li.className = "ca-item";
				const time = this.timeLabel(e, date, now);
				const when = document.createElement("span");
				when.className = time.now ? "ca-when ca-now" : "ca-when";
				when.innerText = time.text;
				li.appendChild(when);
				const text = document.createElement("span");
				text.className = "ca-text";
				text.innerText = e.title || "(bez nosaukuma)";
				li.appendChild(text);
				list.appendChild(li);
			});
			day.appendChild(list);
			wrapper.appendChild(day);
		});

		return wrapper;
	}
});
