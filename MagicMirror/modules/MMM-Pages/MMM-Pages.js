/* MagicMirror² Module: MMM-Pages
 *
 * Vienkāršs "lapu"/logu pārslēdzējs. Ar kreiso/labo bulttaustiņu var
 * pārslēgties starp vairākiem skatiem. Katrā lapā redzami tikai tie
 * moduļi, kas norādīti `pages` sarakstā; `fixed` moduļi redzami vienmēr.
 * Lapas maiņa: vecā lapa izbalē un aizslīd, pēc tam jaunā ienāk no otras
 * puses (virziens atkarīgs no tā, vai ejam uz priekšu vai atpakaļ).
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
		// Visas pārejas ilgums (ms): pusi aiziet vecā lapa, pusi ienāk jaunā.
		animationTime: 500,
		// Cik pikseļus moduļi pārejas laikā aizslīd/ienāk no sāniem.
		slideDistance: 40
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
			// Tikai DOM_OBJECTS_CREATED: ALL_MODULES_STARTED pienāk, pirms moduļu
			// DOM elementi vispār izveidoti, un tad hide() neko nepaslēptu.
			case "DOM_OBJECTS_CREATED":
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
		this.applyPage(next, direction > 0 ? 1 : -1);
	},

	goToPage (index) {
		const total = this.config.pages.length;
		const n = Number(index);
		if (total === 0 || !Number.isInteger(n) || n < 0 || n >= total) return;
		this.applyPage(n, n > this.curPage ? 1 : -1);
	},

	// direction: 1 = uz priekšu (nākamā lapa nāk no labās), -1 = atpakaļ (nāk no kreisās).
	applyPage (index, direction = 1) {
		if (index === this.curPage) return;
		this.curPage = index;
		this.updatePages(direction);
		this.sendNotification("PAGE_CHANGED", this.curPage);
	},

	updatePages (direction = 1) {
		if (!this.domReady || this.config.pages.length === 0) return;

		const visible = this.config.pages[this.curPage] || [];
		// Pirmā izsaukuma reizē (starts) lapu uzliekam uzreiz, bez animācijas.
		const first = !this._initialized;
		this._initialized = true;
		const half = first ? 0 : Math.round(this.config.animationTime / 2);
		const shift = this.config.slideDistance * (direction > 0 ? 1 : -1);

		// Pāreja notiek divās fāzēs: vispirms vecās lapas moduļi izbalē un
		// nedaudz aizslīd, un TIKAI TAD ienāk jaunie. Ja abas lapas animētu
		// vienlaikus, abu lapu moduļi uz brīdi atrastos vienā reģionā viens
		// zem otra (MM tos izņem no plūsmas tikai animācijas beigās), tāpēc
		// jaunā lapa vispirms parādītos nobīdīta un tad „ielēktu" vietā.
		clearTimeout(this._showTimer);
		const incoming = [];
		let animatedOut = false;

		MM.getModules().enumerate((module) => {
			if (module.name === "MMM-Pages") return;

			const keepVisible = this.config.fixed.includes(module.name) || visible.includes(module.name);
			const lockedByUs = module.lockStrings.includes(this.identifier);

			if (keepVisible) {
				// Rādām tikai tos, ko paslēpām mēs — fiksētie un jau redzamie
				// moduļi paliek netraucēti.
				if (lockedByUs) incoming.push(module);
			} else if (!lockedByUs || first) {
				const wasVisible = !module.hidden;
				if (wasVisible && half > 0) {
					animatedOut = true;
					this.slide(module, 0, -shift, half, "ease-in", true);
				}
				try {
					module.hide(wasVisible ? half : 0, () => this.stopSlide(module), { lockString: this.identifier });
				} catch (error) {
					Log.warn(`MMM-Pages: neizdevās paslēpt moduli ${module.name}`, error);
				}
			}
		});

		if (animatedOut) this._outUntil = Date.now() + half;
		// Ja iepriekšējā pāreja vēl izbalina vecos moduļus (ātra šķiršana), gaidām arī to.
		const delay = Math.max(0, (this._outUntil || 0) - Date.now());

		const showIncoming = () => {
			incoming.forEach((module) => {
				try {
					// Ātrā šķiršanā hide() atzvans var nebūt izpildījies — noņemam
					// palikušo nobīdi, lai modulis neparādītos pabīdīts.
					this.stopSlide(module);
					module.show(half, () => {}, { lockString: this.identifier });
					if (half > 0 && !module.hidden) this.slide(module, shift, 0, half, "ease-out", false);
				} catch (error) {
					Log.warn(`MMM-Pages: neizdevās parādīt moduli ${module.name}`, error);
				}
			});
		};

		if (delay > 0) {
			this._showTimer = setTimeout(showIncoming, delay);
		} else {
			showIncoming();
		}
	},

	// Horizontāla nobīde ar Web Animations API (tikai transform — to zīmē GPU,
	// tāpēc nav raustīšanās). Caurspīdīgumu jau animē pats MM (hide/show).
	slide (module, fromX, toX, duration, easing, keep) {
		const wrapper = document.getElementById(module.identifier);
		if (!wrapper || typeof wrapper.animate !== "function") return;
		this.stopSlide(module);
		this._slides = this._slides || {};
		this._slides[module.identifier] = wrapper.animate(
			[{ transform: `translateX(${fromX}px)` }, { transform: `translateX(${toX}px)` }],
			{ duration, easing, fill: keep ? "forwards" : "none" }
		);
	},

	stopSlide (module) {
		const anim = this._slides && this._slides[module.identifier];
		if (anim) {
			anim.cancel();
			delete this._slides[module.identifier];
		}
	}
});
