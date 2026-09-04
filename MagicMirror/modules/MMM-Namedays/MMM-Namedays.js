/* MagicMirror² Module: MMM-Namedays
 *
 * Rāda šodienas latviešu vārda dienas. Pilnībā lokāls — dati iekļauti
 * modulī (namedays.data.js), interneta pieslēgums nav vajadzīgs.
 */
Module.register("MMM-Namedays", {
	defaults: {
		useExtended: false, // false = tradicionālais kalendārs, true = paplašinātais saraksts
		prefix: "", // teksts pirms vārdiem, piem. "Šodien svin: "
		separator: ", ",
		emptyText: "Šodien nav vārda dienu",
		updateOnMidnight: true
	},

	getStyles () {
		return ["MMM-Namedays.css"];
	},

	getScripts () {
		return [this.file("namedays.data.js")];
	},

	start () {
		const data = window.MMM_NAMEDAYS_DATA || { traditional: {}, extended: {} };
		this.dataset = this.config.useExtended ? data.extended : data.traditional;
		if (this.config.updateOnMidnight) this.scheduleMidnightUpdate();
	},

	todayKey () {
		const d = new Date();
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		return `${mm}-${dd}`;
	},

	scheduleMidnightUpdate () {
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30);
		setTimeout(() => {
			this.updateDom(1000);
			this.scheduleMidnightUpdate();
		}, next - now);
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-namedays small";

		const names = this.dataset[this.todayKey()] || [];
		if (names.length === 0) {
			wrapper.className += " dimmed light";
			wrapper.innerHTML = this.config.emptyText;
			return wrapper;
		}

		wrapper.innerHTML = this.config.prefix + names.join(this.config.separator);
		return wrapper;
	}
});
