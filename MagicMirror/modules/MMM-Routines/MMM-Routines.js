/* MagicMirror² Module: MMM-Routines
 *
 * Mājas treniņi: atsevišķa lapa rāda šodienas treniņu (vingrinājumi, sērijas,
 * atkārtojumi). Ko trenēt un kāds inventārs ir pieejams, izvēlas telefona lapā
 * http://<pi-ip>:8080/routines — tur var arī uzģenerēt citu treniņu.
 *
 * Kad kāds nostājas spoguļa priekšā (MMM-FaceRecognition raida FACE_PRESENT),
 * spogulis pajautā, vai treniņš ir pabeigts — ne biežāk kā reizi `promptCooldownMs`
 * (noklusējums 1 h). Atbildi var sniegt ar balsi (MMM-VoiceCommands: "Spoguli,
 * treniņš pabeigts", pēc tam "par vieglu" / "tieši laikā" / "par grūtu") vai
 * telefona lapā. Ja treniņš bija par vieglu, nākamais būs sarežģītāks; ja par
 * grūtu — vieglāks.
 *
 * Visa loģika un glabāšana ir node_helper.js; šis fails tikai attēlo stāvokli.
 * Notifikācijas, ko modulis saprot:
 *   FACE_PRESENT            -> pajautāt par treniņu (ja pagājusi pauze)
 *   ROUTINES_COMPLETE       -> treniņš pabeigts
 *   ROUTINES_FEEDBACK       -> payload "easy" | "ok" | "hard"
 *   ROUTINES_DISMISS        -> aizvērt jautājumu ("vēl ne")
 */
Module.register("MMM-Routines", {
	defaults: {
		promptCooldownMs: 60 * 60 * 1000, // cik ilgi pēc jautājuma nejautāt vēlreiz
		promptDurationMs: 40 * 1000, // cik ilgi jautājums paliek redzams (īsāks par ekrānsaudzētāja taimautu)
		resultDurationMs: 8 * 1000 // cik ilgi rāda "līmenis paaugstināts" apstiprinājumu
	},

	getStyles () {
		return ["font-awesome.css", "MMM-Routines.css"];
	},

	start () {
		this.routines = null;
		this.overlay = null;
		this.overlayKind = null;
		this.overlayTimer = null;

		this.sendSocketNotification("ROUTINES_INIT", {
			promptCooldownMs: this.config.promptCooldownMs,
			port: Number(window.location.port) || 80
		});
	},

	notificationReceived (notification, payload) {
		switch (notification) {
			case "FACE_PRESENT":
				this.sendSocketNotification("ROUTINES_FACE_PRESENT");
				break;
			case "ROUTINES_COMPLETE":
				this.sendSocketNotification("ROUTINES_COMPLETE");
				break;
			case "ROUTINES_FEEDBACK":
				this.sendSocketNotification("ROUTINES_FEEDBACK", payload);
				break;
			case "ROUTINES_DISMISS":
				this.hideOverlay();
				break;
		}
	},

	socketNotificationReceived (notification, payload) {
		switch (notification) {
			case "ROUTINES_STATE":
				this.routines = payload;
				this.updateDom(300);
				this.syncOverlay();
				break;
			case "ROUTINES_ASK":
				this.showAsk(payload.kind);
				break;
			case "ROUTINES_RESULT":
				this.showResult(payload);
				break;
		}
	},

	/* ------------------------- lapa ------------------------- */

	labelsFor (ids, options) {
		const map = new Map((options || []).map((o) => [o.id, o.label]));
		return ids.map((id) => map.get(id) || id);
	},

	el (tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	},

	feedbackLabel (fb) {
		return { easy: "par vieglu", ok: "tieši laikā", hard: "par grūtu" }[fb] || "";
	},

	statusLine (w) {
		if (w.status === "pending") return "Gaida izpildi";
		if (w.status === "awaiting_feedback") return "Pabeigts — kā veicās?";
		const fb = this.feedbackLabel(w.feedback);
		return fb ? `Pabeigts · bija ${fb}` : "Pabeigts";
	},

	buildLevelMeter (level, maxLevel) {
		const wrap = this.el("div", "rt-level");
		wrap.appendChild(this.el("span", "rt-level-label dimmed", `Līmenis ${level}`));
		const meter = this.el("div", "rt-level-meter");
		for (let i = 1; i <= maxLevel; i++) {
			const filled = i <= level;
			const seg = this.el("span", filled ? "rt-level-seg rt-level-filled" : "rt-level-seg");
			if (i === level) seg.classList.add("rt-level-current");
			meter.appendChild(seg);
		}
		wrap.appendChild(meter);
		return wrap;
	},

	buildPlaceholder (iconClass, lines) {
		const box = this.el("div", "rt-placeholder");
		box.appendChild(this.el("i", `fa-solid ${iconClass} rt-placeholder-icon`));
		for (const line of lines) {
			box.appendChild(this.el("div", line.className, line.text));
		}
		return box;
	},

	getDom () {
		const wrapper = this.el("div", "mmm-routines");

		if (!this.routines) {
			wrapper.appendChild(this.buildPlaceholder("fa-dumbbell", [
				{ className: "rt-placeholder-text dimmed light small", text: "Ielādē treniņu…" }
			]));
			return wrapper;
		}

		const { workout: w, options, level, maxLevel, urls } = this.routines;
		const phoneUrl = urls && urls[0] ? urls[0] : "";

		const head = this.el("div", "rt-head");
		head.appendChild(this.el("span", "rt-title bright", "Šodienas treniņš"));
		head.appendChild(this.buildLevelMeter(level, maxLevel));
		wrapper.appendChild(head);

		if (!w) {
			const lines = [{ className: "rt-placeholder-text light", text: "Vēl nav izvēlēts, ko trenēt." }];
			if (phoneUrl) {
				lines.push({ className: "rt-placeholder-hint dimmed", text: `Atver telefonā un izvēlies: ${phoneUrl}` });
			}
			wrapper.appendChild(this.buildPlaceholder("fa-clipboard-list", lines));
			return wrapper;
		}

		const meta = this.el("div", "rt-meta");
		for (const t of this.labelsFor(w.targets, options.targets)) {
			meta.appendChild(this.el("span", "rt-chip rt-chip-target", t));
		}
		const equipLabels = w.equipment.length ? this.labelsFor(w.equipment, options.equipment) : ["Bez inventāra"];
		for (const e of equipLabels) {
			meta.appendChild(this.el("span", "rt-chip rt-chip-equipment", e));
		}
		wrapper.appendChild(meta);

		const list = this.el("ol", "rt-list");
		for (const ex of w.exercises) {
			const li = this.el("li", "rt-item");
			if (ex.media) {
				// Divi kadri (sākuma un beigu poza), kas mainās CSS animācijā.
				const anim = this.el("span", "rt-anim");
				for (const src of ex.media) {
					const img = this.el("img");
					img.src = src;
					img.alt = "";
					anim.appendChild(img);
				}
				li.appendChild(anim);
			}
			li.appendChild(this.el("span", "rt-name bright", ex.name));
			li.appendChild(this.el("span", "rt-detail", ex.detail));
			list.appendChild(li);
		}
		wrapper.appendChild(list);

		const foot = this.el("div", "rt-foot");
		const status = this.el("span", `rt-status rt-${w.status}`, this.statusLine(w));
		if (w.status === "done") status.prepend(this.el("i", "fa-solid fa-circle-check rt-status-icon"));
		foot.appendChild(status);
		foot.appendChild(this.el("span", "rt-rest dimmed", `Atpūta starp sērijām: ${w.restSeconds} s`));
		wrapper.appendChild(foot);

		if (phoneUrl) {
			wrapper.appendChild(this.el("div", "rt-hint dimmed xsmall", `Cits treniņš / izvēle: ${phoneUrl} · Balss: “Spoguli, treniņš pabeigts”`));
		}
		return wrapper;
	},

	/* ------------------------- jautājums (pārklājums) ------------------------- */

	ensureOverlay () {
		if (this.overlay) return this.overlay;
		const root = this.el("div", "mmm-routines-overlay");
		document.body.appendChild(root);
		this.overlay = root;
		return root;
	},

	fillOverlay (title, question, choices) {
		const root = this.ensureOverlay();
		root.textContent = "";
		const card = this.el("div", "rtx-card");
		card.appendChild(this.el("div", "rtx-title", title));
		card.appendChild(this.el("div", "rtx-question", question));
		if (choices.length) {
			const row = this.el("div", "rtx-choices");
			for (const c of choices) {
				const chip = this.el("div", "rtx-choice");
				chip.appendChild(this.el("span", "rtx-choice-label", c.label));
				chip.appendChild(this.el("span", "rtx-choice-say", c.say));
				row.appendChild(chip);
			}
			card.appendChild(row);
		}
		root.appendChild(card);
		root.classList.add("rtx-on");
	},

	armOverlayTimer (ms) {
		clearTimeout(this.overlayTimer);
		this.overlayTimer = setTimeout(() => this.hideOverlay(), ms);
	},

	showAsk (kind) {
		this.overlayKind = kind;
		if (kind === "complete") {
			this.fillOverlay("Treniņš", "Vai šodienas treniņš ir pabeigts?", [
				{ label: "Jā", say: "“Spoguli, treniņš pabeigts”" },
				{ label: "Vēl ne", say: "“Spoguli, vēl ne”" }
			]);
		} else {
			this.fillOverlay("Treniņš pabeigts", "Kā veicās?", [
				{ label: "Par vieglu", say: "“Spoguli, par vieglu”" },
				{ label: "Tieši laikā", say: "“Spoguli, tieši laikā”" },
				{ label: "Par grūtu", say: "“Spoguli, par grūtu”" }
			]);
		}
		this.armOverlayTimer(this.config.promptDurationMs);
	},

	showResult ({ feedback, before, after }) {
		let text;
		if (feedback === "easy") {
			text = after > before ? `Lieliski! Nākamais treniņš būs sarežģītāks (līmenis ${before} → ${after}).` : `Lieliski! Tu jau esi augstākajā līmenī (${after}).`;
		} else if (feedback === "hard") {
			text = after < before ? `Sapratu — nākamais treniņš būs vieglāks (līmenis ${before} → ${after}).` : `Sapratu — vieglāk vairs nevar (līmenis ${after}), turpini!`;
		} else {
			text = `Super! Līmenis paliek ${after}.`;
		}
		this.overlayKind = "result";
		this.fillOverlay("Treniņš pabeigts", text, []);
		this.armOverlayTimer(this.config.resultDurationMs);
	},

	// Ja stāvoklis mainījies citur (piem. atbildēts telefonā), pielāgo jau redzamo jautājumu.
	syncOverlay () {
		if (!this.overlay || !this.overlay.classList.contains("rtx-on")) return;
		if (this.overlayKind === "result" || !this.routines.workout) return;
		const status = this.routines.workout.status;
		if (status === "done") this.hideOverlay();
		else if (status === "awaiting_feedback" && this.overlayKind === "complete") this.showAsk("feedback");
	},

	hideOverlay () {
		clearTimeout(this.overlayTimer);
		this.overlayKind = null;
		if (this.overlay) this.overlay.classList.remove("rtx-on");
	},

	stop () {
		clearTimeout(this.overlayTimer);
		if (this.overlay) this.overlay.remove();
	}
});
