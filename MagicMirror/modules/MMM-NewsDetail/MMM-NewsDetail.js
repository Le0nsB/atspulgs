/* MagicMirror² Module: MMM-NewsDetail
 *
 * Atsevišķa lapa ar ziņām detalizētāk: viena ziņa vienlaikus — virsraksts,
 * pilns kopsavilkums, avots un laiks. Ziņas nāk no `newsfeed` moduļa
 * (NEWS_FEED notifikācija, tāpēc `broadcastNewsFeeds: true` jābūt ieslēgtam).
 *
 * Bez kursora: ziņas rotē automātiski. Ar žestu (MMM-GestureNav ✊ dūre ->
 * NEWSDETAIL_NEXT) var pāriet uz nākamo un uz brīdi apturēt rotāciju, lai
 * paspētu izlasīt.
 */
Module.register("MMM-NewsDetail", {
	defaults: {
		sourceLabel: "Ziņas", // virsraksts virs ziņas (RSS avota nosaukums)
		rotateInterval: 18 * 1000, // cik ilgi rāda katru ziņu
		pauseAfterManual: 60 * 1000, // pēc manuālas pārslēgšanas tik ilgi nerotē
		maxDescriptionChars: 0, // 0 = viss teksts; citādi apgriež ar "…"
		nextNotification: "NEWSDETAIL_NEXT",
		prevNotification: "NEWSDETAIL_PREV",
		hint: "✊ = nākamā ziņa"
	},

	getStyles () {
		return ["MMM-NewsDetail.css"];
	},

	start () {
		this.items = [];
		this.index = 0;
		this.pausedUntil = 0;
		this.rotateTimer = null;
		this.scheduleRotate();
	},

	scheduleRotate () {
		clearTimeout(this.rotateTimer);
		this.rotateTimer = setTimeout(() => this.tick(), this.config.rotateInterval);
	},

	tick () {
		if (Date.now() >= this.pausedUntil && this.items.length > 1) {
			this.index = (this.index + 1) % this.items.length;
			this.updateDom(600);
		}
		this.scheduleRotate();
	},

	step (dir) {
		if (this.items.length < 2) return;
		this.index = (this.index + dir + this.items.length) % this.items.length;
		this.pausedUntil = Date.now() + this.config.pauseAfterManual;
		this.updateDom(300);
		this.scheduleRotate();
	},

	notificationReceived (notification, payload) {
		if (notification === "NEWS_FEED" && payload && Array.isArray(payload.items)) {
			const hadNone = this.items.length === 0;
			this.items = payload.items;
			if (this.index >= this.items.length) this.index = 0;
			if (hadNone) this.updateDom(600);
		} else if (notification === this.config.nextNotification) {
			this.step(1);
		} else if (notification === this.config.prevNotification) {
			this.step(-1);
		}
	},

	formatDate (pubdate) {
		if (!pubdate || typeof moment !== "function") return "";
		const m = moment(new Date(pubdate));
		if (!m.isValid()) return "";
		return `${m.format("DD.MM.YYYY HH:mm")} · ${m.fromNow()}`;
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-newsdetail";

		if (!this.items.length) {
			wrapper.className += " dimmed light small";
			wrapper.innerHTML = "Ielādē ziņas…";
			return wrapper;
		}

		const item = this.items[this.index];

		const head = document.createElement("div");
		head.className = "nd-head";

		const source = document.createElement("span");
		source.className = "nd-source bright";
		source.textContent = this.config.sourceLabel;
		head.appendChild(source);

		const counter = document.createElement("span");
		counter.className = "nd-counter dimmed";
		counter.textContent = `${this.index + 1} / ${this.items.length}`;
		head.appendChild(counter);

		wrapper.appendChild(head);

		const date = this.formatDate(item.pubdate);
		if (date) {
			const d = document.createElement("div");
			d.className = "nd-date dimmed light";
			d.textContent = date;
			wrapper.appendChild(d);
		}

		const title = document.createElement("div");
		title.className = "nd-title bright";
		title.textContent = item.title || "";
		wrapper.appendChild(title);

		let desc = item.description || "";
		if (this.config.maxDescriptionChars > 0 && desc.length > this.config.maxDescriptionChars) {
			desc = `${desc.slice(0, this.config.maxDescriptionChars).trim()}…`;
		}
		if (desc) {
			const p = document.createElement("div");
			p.className = "nd-desc light";
			p.textContent = desc;
			wrapper.appendChild(p);
		}

		const foot = document.createElement("div");
		foot.className = "nd-foot dimmed xsmall";
		const paused = Date.now() < this.pausedUntil;
		foot.textContent = paused ? `${this.config.hint} · pauze` : this.config.hint;
		wrapper.appendChild(foot);

		return wrapper;
	},

	stop () {
		clearTimeout(this.rotateTimer);
	}
});
