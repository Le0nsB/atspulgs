/* MagicMirror²
 * Module: MMM-Screensaver
 *
 * Pēc `timeout` neaktivitātes parāda pilnekrāna ekrānsaudzētāju, kas rotē
 * starp vairākiem "sejas" — Matrix digitālais lietus, digitālais pulkstenis
 * un lēni rotējošs ikosaedrs (3D stiepļu karkass). Kamēr ekrānsaudzētājs
 * aktīvs, ik pēc `screensaverDuration` pāriet uz nākamo sarakstā
 * (`screensavers`), tad atkal no sākuma.
 *
 * Jebkura mijiedarbība (pele/tastatūra/pieskāriens VAI cita moduļa
 * notifikācija no `activityNotifications` saraksta — žesti, balss komandas,
 * tālvadība) to paslēpj un no jauna sāk skaitīt neaktivitātes laiku.
 *
 * Aizstāj MMM-MatrixScreensaver (tā loģika iekļauta kā viena no "sejām"),
 * lai nebūtu vairāku neatkarīgu idle-taimeru, kas cīnās par to pašu
 * pilnekrāna pārklājumu.
 *
 * MIT Licensed.
 */
Module.register("MMM-Screensaver", {
	defaults: {
		timeout: 60 * 1000,        // cik ilgi bez mijiedarbības līdz ekrānsaudzētājam (ms)
		fadeSpeed: 1200,           // parādīšanās/paslēpšanās ilgums (ms)
		dimOtherModules: true,     // aiz ekrānsaudzētāja paslēpj pārējos moduļus
		respectUserPresence: true, // ņem vērā MMM-Remote-Control USER_PRESENCE (true = ir cilvēks)
		activityEvents: ["mousemove", "mousedown", "touchstart", "keydown", "wheel"],
		activityNotifications: [
			"PAGES_NEXT", "PAGES_PREV", "PAGES_HOME", "PAGES_GOTO", "PAGE_CHANGED",
			"PAGE_INCREMENT", "PAGE_DECREMENT", "NEWSDETAIL_NEXT",
			"VOICE_ACTIVATED", "VOICE_COMMAND", "VOICE_DEACTIVATED",
			"REMOTE_ACTION"
		],
		ignoreNotifications: [],   // nekad neskaita kā mijiedarbību (pat ja augšējā sarakstā)
		debug: false,

		// --- "sejas" un rotācija starp tām ---
		screensavers: ["matrix", "clock", "icosahedron"], // secība (var arī atstāt tikai vienu/divus)
		screensaverDuration: 45 * 1000, // cik ilgi rāda katru, pirms pāriet uz nākamo (0 = nerotē)
		randomOrder: false,             // true = nākamā seja izvēlēta nejauši (nevis pēc kārtas)

		matrix: {
			fps: 30,
			fontSize: 28,
			color: "#ffffff",
			headColor: "#ffffff",
			trailFade: 0.06,
			glowBlur: 6,
			characters:
				"アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
				"0123456789Z:.=*+-<>¦｜╌ﾊﾐﾋｰｳｼﾅﾉ"
		},

		clock: {
			color: "#00e5ff",
			glowBlur: 20,
			showSeconds: true,
			showDate: true
		},

		icosahedron: {
			fps: 30,
			color: "#8a5cff",
			glowBlur: 10,
			rotationSpeed: 0.25, // rad/s ap Y asi (X ass rotē ar 0.4x šo ātrumu)
			size: 0.32           // rādiuss kā daļa no min(platums, augstums)
		}
	},

	getStyles () {
		return ["MMM-Screensaver.css"];
	},

	start () {
		this.active = false;
		this.lastActivity = Date.now();
		this.idleTimer = null;
		this.rotateTimer = null;
		this.wired = false;
		this.currentFace = null;
		this.faceIndex = 0;

		this.matrixTimer = null;
		this.icoTimer = null;
		this.clockTimer = null;
		this._stopTimer = null;

		this._activitySet = new Set(this.config.activityNotifications);
		this._ignoreSet = new Set(this.config.ignoreNotifications);
		this._onActivity = () => this.registerActivity();
		this._onResize = () => this.resizeCanvases();

		Log.info(`${this.name}: startē, timeout ${this.config.timeout} ms, sejas: ${this.config.screensavers.join(", ")}`);
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-screensaver";
		wrapper.style.transitionDuration = `${this.config.fadeSpeed}ms`;

		const matrixCanvas = document.createElement("canvas");
		matrixCanvas.className = "ss-face ss-canvas ss-face-matrix";
		wrapper.appendChild(matrixCanvas);

		const icoCanvas = document.createElement("canvas");
		icoCanvas.className = "ss-face ss-canvas ss-face-icosahedron";
		wrapper.appendChild(icoCanvas);

		const clockEl = document.createElement("div");
		clockEl.className = "ss-face ss-face-clock";
		const timeEl = document.createElement("div");
		timeEl.className = "ss-clock-time";
		const dateEl = document.createElement("div");
		dateEl.className = "ss-clock-date";
		clockEl.appendChild(timeEl);
		clockEl.appendChild(dateEl);

		wrapper.appendChild(clockEl);

		this.wrapper = wrapper;
		this.matrixCanvas = matrixCanvas;
		this.icoCanvas = icoCanvas;
		this.clockEl = clockEl;
		this.clockTimeEl = timeEl;
		this.clockDateEl = dateEl;
		return wrapper;
	},

	notificationReceived (notification, payload, sender) {
		if (notification === "MODULE_DOM_CREATED") {
			if (this.matrixCanvas) this.setup();
			return;
		}

		// Ignorējam pašu MagicMirror periodiskās un citas "trokšņa" notifikācijas —
		// skaitās tikai skaidra lietotāja darbība.
		if (!sender) return;
		if (this._ignoreSet.has(notification)) return;

		if (this.config.respectUserPresence && notification === "USER_PRESENCE") {
			if (payload) this.registerActivity();
			return;
		}

		if (this._activitySet.has(notification)) {
			if (this.config.debug) Log.log(`${this.name}: mijiedarbība no notifikācijas ${notification}`);
			this.registerActivity();
		}
	},

	// ---- iestatīšana pēc DOM ----

	setup () {
		if (this.wired || !this.matrixCanvas) return;
		this.wired = true;

		this.matrixCtx = this.matrixCanvas.getContext("2d");
		this.icoCtx = this.icoCanvas.getContext("2d");
		this.resizeCanvases();
		this.setupIcosahedron();

		this.config.activityEvents.forEach((ev) => {
			window.addEventListener(ev, this._onActivity, { passive: true });
		});
		window.addEventListener("resize", this._onResize, { passive: true });

		this.idleTimer = setInterval(() => this.checkIdle(), 1000);
		if (this.config.debug) Log.log(`${this.name}: setup pabeigts`);
	},

	checkIdle () {
		if (this.active) return;
		if (Date.now() - this.lastActivity >= this.config.timeout) this.activate();
	},

	registerActivity () {
		this.lastActivity = Date.now();
		if (this.active) this.deactivate();
	},

	// ---- rādīšana / slēpšana ----

	activate () {
		if (this.active) return;
		if (!this.config.screensavers.length) return;
		this.active = true;
		if (this.config.debug) Log.log(`${this.name}: ekrānsaudzētājs IESLĒGTS`);

		this.resizeCanvases();
		this.wrapper.classList.add("active");
		if (this.config.dimOtherModules) document.body.classList.add("mmm-screensaver-on");

		this.faceIndex = this.config.randomOrder
			? Math.floor(Math.random() * this.config.screensavers.length)
			: 0;
		this.showFace(this.config.screensavers[this.faceIndex]);
		this.scheduleFaceRotation();
	},

	deactivate () {
		if (!this.active) return;
		this.active = false;
		if (this.config.debug) Log.log(`${this.name}: ekrānsaudzētājs IZSLĒGTS`);

		clearTimeout(this.rotateTimer);
		this.wrapper.classList.remove("active");
		document.body.classList.remove("mmm-screensaver-on");

		// Ļaujam izbālēt, tad apturam visas animācijas, lai netērētu CPU.
		clearTimeout(this._stopTimer);
		this._stopTimer = setTimeout(() => {
			if (!this.active) this.stopAllFaceLoops();
		}, this.config.fadeSpeed);
	},

	scheduleFaceRotation () {
		clearTimeout(this.rotateTimer);
		if (this.config.screensavers.length < 2 || this.config.screensaverDuration <= 0) return;
		this.rotateTimer = setTimeout(() => {
			if (!this.active) return;
			this.faceIndex = this.config.randomOrder
				? this.pickRandomDifferentIndex()
				: (this.faceIndex + 1) % this.config.screensavers.length;
			this.showFace(this.config.screensavers[this.faceIndex]);
			this.scheduleFaceRotation();
		}, this.config.screensaverDuration);
	},

	pickRandomDifferentIndex () {
		const n = this.config.screensavers.length;
		if (n < 2) return 0;
		let idx;
		do {
			idx = Math.floor(Math.random() * n);
		} while (idx === this.faceIndex);
		return idx;
	},

	// ---- sejas pārslēgšana ----

	showFace (name) {
		this.currentFace = name;
		this.matrixCanvas.classList.toggle("ss-face-active", name === "matrix");
		this.icoCanvas.classList.toggle("ss-face-active", name === "icosahedron");
		this.clockEl.classList.toggle("ss-face-active", name === "clock");

		this.stopAllFaceLoops();
		if (name === "matrix") this.startMatrix();
		else if (name === "icosahedron") this.startIcosahedron();
		else if (name === "clock") this.startClock();
	},

	stopAllFaceLoops () {
		clearInterval(this.matrixTimer); this.matrixTimer = null;
		clearInterval(this.icoTimer); this.icoTimer = null;
		clearInterval(this.clockTimer); this.clockTimer = null;
	},

	// ---- izmērs ----

	resizeCanvases () {
		if (!this.matrixCanvas || !this.icoCanvas) return;
		const dpr = window.devicePixelRatio || 1;
		this.width = window.innerWidth;
		this.height = window.innerHeight;

		for (const canvas of [this.matrixCanvas, this.icoCanvas]) {
			canvas.width = this.width * dpr;
			canvas.height = this.height * dpr;
			canvas.style.width = `${this.width}px`;
			canvas.style.height = `${this.height}px`;
			canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		this.matrixColumns = Math.max(1, Math.floor(this.width / this.config.matrix.fontSize));
		this.seedMatrixDrops();
	},

	// ==================================================================
	// Seja 1: Matrix digitālais lietus (pārnests no MMM-MatrixScreensaver)
	// ==================================================================

	seedMatrixDrops () {
		const rows = this.height / this.config.matrix.fontSize;
		this.matrixDrops = new Array(this.matrixColumns);
		for (let i = 0; i < this.matrixColumns; i++) {
			// Sākam pa daļai virs ekrāna, lai kolonnas nekrīt sinhroni.
			this.matrixDrops[i] = Math.floor(Math.random() * -rows);
		}
	},

	startMatrix () {
		this.seedMatrixDrops();
		this.matrixCtx.clearRect(0, 0, this.width, this.height);
		clearInterval(this.matrixTimer);
		const frameMs = Math.max(16, Math.round(1000 / this.config.matrix.fps));
		this.matrixTimer = setInterval(() => this.drawMatrix(), frameMs);
	},

	drawMatrix () {
		const ctx = this.matrixCtx;
		const { fontSize, color, headColor, trailFade, glowBlur, characters } = this.config.matrix;
		if (!ctx) return;

		// Puscaurspīdīgs melns pārklājums -> vecie glifi pakāpeniski dziest.
		ctx.globalCompositeOperation = "source-over";
		ctx.fillStyle = `rgba(0, 0, 0, ${trailFade})`;
		ctx.fillRect(0, 0, this.width, this.height);

		ctx.font = `${fontSize}px "Courier New", monospace`;
		ctx.textBaseline = "top";
		if (glowBlur > 0) {
			ctx.shadowColor = color;
			ctx.shadowBlur = glowBlur;
		}

		const rows = this.height / fontSize;
		for (let i = 0; i < this.matrixColumns; i++) {
			const ch = characters.charAt(Math.floor(Math.random() * characters.length));
			const x = i * fontSize;
			const y = this.matrixDrops[i] * fontSize;

			// ~8% kolonnu kadrā dabū spožu "galvu".
			ctx.fillStyle = Math.random() < 0.08 ? headColor : color;
			ctx.fillText(ch, x, y);

			if (this.matrixDrops[i] > rows && Math.random() > 0.975) {
				this.matrixDrops[i] = 0;
			}
			this.matrixDrops[i]++;
		}
		ctx.shadowBlur = 0;
	},

	// ==================================================================
	// Seja 2: digitālais pulkstenis
	// ==================================================================

	startClock () {
		const cfg = this.config.clock;
		this.clockEl.style.color = cfg.color;
		this.clockEl.style.textShadow = cfg.glowBlur > 0 ? `0 0 ${cfg.glowBlur}px currentColor` : "none";
		this.clockDateEl.style.display = cfg.showDate ? "block" : "none";
		this.updateClock();
		clearInterval(this.clockTimer);
		this.clockTimer = setInterval(() => this.updateClock(), 1000);
	},

	updateClock () {
		const cfg = this.config.clock;
		const now = new Date();
		const hh = String(now.getHours()).padStart(2, "0");
		const mm = String(now.getMinutes()).padStart(2, "0");
		const ss = String(now.getSeconds()).padStart(2, "0");
		this.clockTimeEl.textContent = cfg.showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
		if (cfg.showDate) {
			this.clockDateEl.textContent = now.toLocaleDateString("lv-LV", {
				weekday: "long", day: "numeric", month: "long"
			});
		}
	},

	// ==================================================================
	// Seja 3: lēni rotējošs ikosaedrs (3D stiepļu karkass)
	// ==================================================================

	/* Standarta ikosaedra virsotnes (uz vienības sfēras) un skaldnes —
	 * skaldnes izmanto tikai, lai atvasinātu unikālo malu sarakstu (30 malas),
	 * pašas skaldnes nezīmējam (tikai stiepļu karkasu). */
	setupIcosahedron () {
		const t = (1 + Math.sqrt(5)) / 2;
		const raw = [
			[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
			[0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
			[t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
		];
		const len = Math.sqrt(1 + t * t);
		this.icoVerts = raw.map(([x, y, z]) => [x / len, y / len, z / len]);

		const faces = [
			[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
			[1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
			[3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
			[4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
		];
		const seen = new Set();
		this.icoEdges = [];
		for (const [a, b, c] of faces) {
			for (const [i, j] of [[a, b], [b, c], [c, a]]) {
				const key = i < j ? `${i}-${j}` : `${j}-${i}`;
				if (seen.has(key)) continue;
				seen.add(key);
				this.icoEdges.push([i, j]);
			}
		}

		this.icoAngleX = 0.4;
		this.icoAngleY = 0;
	},

	startIcosahedron () {
		clearInterval(this.icoTimer);
		const frameMs = Math.max(16, Math.round(1000 / this.config.icosahedron.fps));
		this.icoTimer = setInterval(() => this.drawIcosahedron(frameMs), frameMs);
	},

	rotatePoint (x, y, z, angleX, angleY) {
		// Ap X asi
		const y1 = y * Math.cos(angleX) - z * Math.sin(angleX);
		const z1 = y * Math.sin(angleX) + z * Math.cos(angleX);
		// Ap Y asi
		const x2 = x * Math.cos(angleY) + z1 * Math.sin(angleY);
		const z2 = -x * Math.sin(angleY) + z1 * Math.cos(angleY);
		return [x2, y1, z2];
	},

	drawIcosahedron (frameMs) {
		const ctx = this.icoCtx;
		const cfg = this.config.icosahedron;
		if (!ctx) return;

		this.icoAngleY += cfg.rotationSpeed * (frameMs / 1000);
		this.icoAngleX += cfg.rotationSpeed * 0.4 * (frameMs / 1000);

		const cx = this.width / 2;
		const cy = this.height / 2;
		const radius = Math.min(this.width, this.height) * cfg.size;
		const focal = radius * 3.2;

		const projected = this.icoVerts.map(([x, y, z]) => {
			const [rx, ry, rz] = this.rotatePoint(x, y, z, this.icoAngleX, this.icoAngleY);
			const scale = focal / (focal + rz * radius);
			return { x: cx + rx * radius * scale, y: cy + ry * radius * scale, z: rz };
		});

		ctx.clearRect(0, 0, this.width, this.height);
		if (cfg.glowBlur > 0) {
			ctx.shadowColor = cfg.color;
			ctx.shadowBlur = cfg.glowBlur;
		}
		ctx.strokeStyle = cfg.color;
		ctx.lineCap = "round";

		// Zīmējam no tālākajām uz tuvākajām malām, lai tuvākās pārklātu tālākās.
		const withDepth = this.icoEdges
			.map(([i, j]) => ({ i, j, z: (projected[i].z + projected[j].z) / 2 }))
			.sort((a, b) => a.z - b.z);

		for (const e of withDepth) {
			const p1 = projected[e.i];
			const p2 = projected[e.j];
			const depthT = (e.z + 1) / 2; // z ir aptuveni [-1, 1] -> [0, 1]
			ctx.globalAlpha = 0.35 + 0.65 * depthT;
			ctx.lineWidth = 1 + 2 * depthT;
			ctx.beginPath();
			ctx.moveTo(p1.x, p1.y);
			ctx.lineTo(p2.x, p2.y);
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
		ctx.shadowBlur = 0;
	},

	suspend () {
		// Ja kāds cits (piem. MMM-Pages) mūs paslēpj — apturam animācijas.
		if (this.active) this.deactivate();
	}
});
