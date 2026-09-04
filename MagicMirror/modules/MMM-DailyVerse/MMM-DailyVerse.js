/* MagicMirror² Module: MMM-DailyVerse
 *
 * Rāda dienas pantiņu vai joku. Pilnībā lokāls — tekstus ņem no `items`
 * saraksta konfigurācijā. "daily" režīmā teksts mainās reizi dienā,
 * "random" režīmā — katrā atsvaidzē (vai pēc `updateInterval`).
 */
Module.register("MMM-DailyVerse", {
	defaults: {
		mode: "daily", // "daily" vai "random"
		updateInterval: 0, // ms; ja > 0 un mode="random", cik bieži mainīt tekstu
		className: "small light", // MagicMirror teksta klases
		items: [
			"Nāc ar sauli, ej ar sauli,<br>Tad saulīte līdzi tek.",
			"Smejies, mana valodiņa,<br>Ne par mani ļaudis smēja.",
			"Lai bēdāja bēdu māte,<br>Ne es biju bēdu bērns.",
			"Kas kaitēja nedzīvot<br>Div' baltās māmuliņās.",
			"Maza biju, neredzēju,<br>Kur aug mana līgaviņa.",
			"Tautas dziesmu nezināju,<br>Bet ar dziesmu uzaugu.",
			"— Kāpēc dators aizgāja pie ārsta?<br>— Tam bija vīruss.",
			"Skolotājs: “Nosauc divus vietniekvārdus.”<br>Skolēns: “Kas, es?”",
			"Optimists redz gaismu tuneļa galā.<br>Reālists redz vilcienu.",
			"Sieva vīram: “Aizej pēc piena, un ja būs olas, paņem desmit.”<br>Vīrs pārnāk ar desmit maisiņiem piena: “Olas bija.”",
			"Skolotāja: “Jānīt, kāpēc tu atkal kavē?”<br>Jānītis: “Ceļa zīme teica: skola priekšā, brauciet lēni.”",
			"Optimistam glāze ir puspilna, pesimistam — pustukša.<br>Inženierim glāze ir divreiz par lielu.",
			"Divi teļi runā par nākotni.<br>Viens saka: “Kaut kā man šī gaļas industrija nepatīk.”",
			"— Ko tu dari? — Neko.<br>— Bet vakar tu jau to darīji! — Nebiju pabeidzis."
		]
	},

	getStyles () {
		return ["MMM-DailyVerse.css"];
	},

	start () {
		this.index = this.pickIndex();
		if (this.config.mode === "random" && this.config.updateInterval > 0) {
			setInterval(() => {
				this.index = this.pickIndex();
				this.updateDom(1000);
			}, this.config.updateInterval);
		} else if (this.config.mode === "daily") {
			this.scheduleMidnightUpdate();
		}
	},

	pickIndex () {
		const n = this.config.items.length;
		if (n === 0) return -1;
		if (this.config.mode === "random") return Math.floor(Math.random() * n);
		const now = new Date();
		const startOfYear = new Date(now.getFullYear(), 0, 0);
		const dayOfYear = Math.floor((now - startOfYear) / 86400000);
		return dayOfYear % n;
	},

	scheduleMidnightUpdate () {
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30);
		setTimeout(() => {
			this.index = this.pickIndex();
			this.updateDom(1000);
			this.scheduleMidnightUpdate();
		}, next - now);
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = `mmm-dailyverse ${this.config.className}`;
		if (this.index < 0) return wrapper;

		const item = this.config.items[this.index];
		wrapper.innerHTML = typeof item === "string" ? item : item.text || "";
		return wrapper;
	}
});
