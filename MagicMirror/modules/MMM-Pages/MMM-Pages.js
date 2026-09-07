/* MagicMirror² Module: MMM-Pages
 *
 * Vienkāršs "lapu"/logu pārslēdzējs. Ar kreiso/labo bulttaustiņu var
 * pārslēgties starp vairākiem skatiem. Katrā lapā redzami tikai tie
 * moduļi, kas norādīti `pages` sarakstā; `fixed` moduļi redzami vienmēr.
 *
 * Citi moduļi (piem. MMM-GestureNav) var pārslēgt lapas ar notifikācijām:
 *   PAGES_NEXT              -> nākamā lapa
 *   PAGES_PREV              -> iepriekšējā lapa
 *   PAGES_HOME             -> sākuma lapa (config.home)
 *   PAGES_GOTO  (payload=n) -> lapa ar indeksu n
 * Pēc pārslēgšanās raida PAGE_CHANGED ar jauno indeksu.
 *
 * Pilnībā lokāls, interneta pieslēgums nav vajadzīgs.
 */
Module.register("MMM-Pages", {
	defaults: {
		// Katrs elements ir moduļu nosaukumu masīvs. Indekss 0 = sākuma lapa.
		pages: [],
		// Moduļi, kas redzami visās lapās (piem. pulkstenis).
		fixed: [],
		// Ar kuru lapu sākt (indekss no `pages`).
		home: 0,
		// Vai klausīties kreiso/labo bulttaustiņu.
		useArrowKeys: true,
		// Vai apļot: no pēdējās lapas ar "pa labi" atgriezties pirmajā.
		wrap: true,
		// Pārejas animācijas ilgums (ms).
		animationTime: 400
	},

	start () {
		this.curPage = this.config.home;
		this.domReady = false;

		if (this.config.useArrowKeys) {
			this._keyHandler = (event) => this.onKeyDown(event);
			document.addEventListener("keydown", this._keyHandler);
		}
	},

	stop () {
		if (this._keyHandler) {
			document.removeEventListener("keydown", this._keyHandler);
			this._keyHandler = null;
		}
	},

	getDom () {
		// Modulim nav redzama satura.
		const wrapper = document.createElement("div");
		wrapper.style.display = "none";
		return wrapper;
	},

	notificationReceived (notification, payload) {
		switch (notification) {
			case "DOM_OBJECTS_CREATED":
			case "ALL_MODULES_STARTED":
				this.domReady = true;
				this.updatePages();
				break;
			case "PAGES_NEXT":
				this.changePage(1);
				break;
			case "PAGES_PREV":
				this.changePage(-1);
				break;
			case "PAGES_HOME":
				this.goToPage(this.config.home);
				break;
			case "PAGES_GOTO":
				this.goToPage(payload);
				break;
		}
	},

	onKeyDown (event) {
		if (event.key === "ArrowRight") {
			event.preventDefault();
			this.changePage(1);
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			this.changePage(-1);
		}
	},

	changePage (direction) {
		const total = this.config.pages.length;
		if (total === 0) return;

		let next = this.curPage + direction;
		if (this.config.wrap) {
			next = (next % total + total) % total;
		} else {
			next = Math.max(0, Math.min(total - 1, next));
		}
		this.applyPage(next);
	},

	goToPage (index) {
		const total = this.config.pages.length;
		const n = Number(index);
		if (total === 0 || !Number.isInteger(n) || n < 0 || n >= total) return;
		this.applyPage(n);
	},

	applyPage (index) {
		if (index === this.curPage) return;
		this.curPage = index;
		this.updatePages();
		this.sendNotification("PAGE_CHANGED", this.curPage);
	},

	updatePages () {
		if (!this.domReady || this.config.pages.length === 0) return;

		const visible = this.config.pages[this.curPage] || [];
		const speed = this.config.animationTime;

		MM.getModules().enumerate((module) => {
			if (module.name === "MMM-Pages") return;

			const keepVisible = this.config.fixed.includes(module.name) || visible.includes(module.name);

			const noop = () => {};
			try {
				if (keepVisible) {
					module.show(speed, noop, { lockString: this.identifier });
				} else {
					module.hide(speed, noop, { lockString: this.identifier });
				}
			} catch (error) {
				Log.warn(`MMM-Pages: neizdevās pārslēgt moduli ${module.name}`, error);
			}
		});
	}
});
