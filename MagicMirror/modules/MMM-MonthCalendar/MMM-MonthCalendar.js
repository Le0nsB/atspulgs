/* MagicMirror² Module: MMM-MonthCalendar
 *
 * Rāda tekošā mēneša kalendāru režģī. Katrā datumā parādīta arī tās
 * dienas vārda diena(s). Vārdu dati tiek ņemti no MMM-Namedays moduļa
 * (namedays.data.js) — pilnībā lokāli, internets nav vajadzīgs.
 */
Module.register("MMM-MonthCalendar", {
	defaults: {
		firstDayOfWeek: 1, // 1 = pirmdiena
		useExtended: false, // saskaņā ar MMM-Namedays
		maxNamesPerDay: 2,
		showNamedays: true,
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
		const data = window.MMM_NAMEDAYS_DATA || { traditional: {}, extended: {} };
		this.namedays = this.config.useExtended ? data.extended : data.traditional;
		if (this.config.updateOnMidnight) this.scheduleMidnightUpdate();
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

			grid.appendChild(cell);
		}

		wrapper.appendChild(grid);
		return wrapper;
	}
});
