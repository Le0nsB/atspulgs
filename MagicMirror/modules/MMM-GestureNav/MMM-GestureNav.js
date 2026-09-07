/* MagicMirror² Module: MMM-GestureNav
 *
 * Roku žestu navigācija. Ar tīmekļa kameru + MediaPipe Hands atpazīst
 * STATISKUS žestus — rādi tik pirkstu, cik vajag, un turi nekustīgi ~0,5 s:
 *   • 1 pirksts        -> notifikācija (pēc noklusējuma PAGES_GOTO 0 = laiks)
 *   • 2 pirksti        -> notifikācija (pēc noklusējuma PAGES_GOTO 2 = kalendārs)
 *   • atvērta plauksta -> notifikācija (pēc noklusējuma PAGES_HOME)
 * (Pēc izvēles var ieslēgt arī pāršķiršanu ar roku: swipeEnabled: true.)
 *
 * MediaPipe darbojas atsevišķā Web Worker'ī (gesture.worker.js) — gan tāpēc,
 * ka tas nesaderas ar MagicMirror globālo `Module`, gan lai neslogotu galveno
 * pavedienu. Viss lokāli (modelis un WASM iekļauti modulī pēc `npm install`).
 * Saderīgs ar MMM-Pages notifikāciju API. Nepieciešams ELECTRON_ENABLE_GPU=1.
 */
Module.register("MMM-GestureNav", {
	defaults: {
		// --- kamera ---
		cameraWidth: 640,
		cameraHeight: 480,
		deviceId: null, // konkrētas kameras id (navigator.mediaDevices.enumerateDevices)

		// --- apstrāde ---
		processingFps: 15, // cik reižu sekundē analizēt kadru (mazāk = mazāk CPU; Pi5 domāts ~10-15)
		analysisWidth: 320, // kadrs pirms analīzes tiek samazināts līdz šim platumam (px)
		numHands: 1,
		// "CPU" (noklusējums — MagicMirror Electron parasti ir bez WebGL worker'ī)
		// vai "GPU". Ja "GPU" neizdodas, automātiski pārslēdzas uz "CPU".
		delegate: "CPU",

		// --- statisko žestu atpazīšana ---
		holdMs: 500, // cik ilgi žests jātur nekustīgi, lai nostrādātu
		graceMs: 250, // īss (< šis) mērījuma "lēciens" nenullē taimeri
		cooldownMs: 1200, // pēc nostrādāšanas šo laiku neko neatpazīst
		palmMinFingers: 4, // tik izstieptu pirkstu = "atvērta plauksta"

		// Ko darīt pie katra žesta. Notifikācija (+ neobligāts payload).
		// null / "" = žests neko nedara. Pirksti = izstiepti rādītājs..mazais.
		oneFinger: "PAGES_GOTO", oneFingerPayload: 0, // 1 pirksts -> nedēļas laiks (lapa 0)
		twoFingers: "PAGES_GOTO", twoFingersPayload: 2, // 2 pirksti -> mēneša kalendārs (lapa 2)
		threeFingers: null, threeFingersPayload: undefined,
		openPalm: "PAGES_HOME", openPalmPayload: undefined, // atvērta plauksta -> sākums

		// --- pāršķiršana ar roku (swipe) — pēc noklusējuma IZSLĒGTA ---
		swipeEnabled: false,
		swipeMinTravel: 0.22, // cik lielu daļu no kadra platuma rokai jānoiet (0..1)
		swipeWindowMs: 500, // kustībai jānotiek šajā laika logā
		swipeMinVelocity: 0.6, // minimālais ātrums (kadra platuma daļas sekundē)
		mirror: true, // spoguļo horizontāli, lai roka pa labi = swipe pa labi
		onSwipeLeft: "PAGES_PREV",
		onSwipeRight: "PAGES_NEXT",

		// --- priekšskatījums (atkļūdošanai) ---
		showPreview: true,
		previewWidth: 220,

		debug: false
	},

	getStyles () {
		return ["MMM-GestureNav.css"];
	},

	start () {
		this.status = "startē…";
		this.lastActionLabel = "";
		this.lastFireAt = 0;
		this.gestureBucket = -1; // pašreiz noturētais žests (0..3, 5=plauksta, -1=nav)
		this.gestureSince = 0; // kopš kura brīža bakets ir nemainīgs
		this.gestureLastSeen = 0; // pēdējais kadrs, kad bakets sakrita
		this.firedBucket = -1; // pēdējais nostrādājušais bakets (lai neatkārtojas turot)
		this.track = []; // [{ t, x }] — tikai swipe režīmam
		this.video = null;
		this.stream = null;
		this.worker = null;
		this.workerReady = false;
		this.cameraReady = false;
		this.looping = false;
		this.pending = 0; // izsūtītā kadra laiks (0 = nav)
		this.lastTs = 0; // pēdējais worker'im nosūtītais laikspiedols (stingri augošs)

		this.initWorker();
		this.startCamera().catch((error) => this.fail(error));
	},

	moduleUrl (relative) {
		return new URL(this.file(relative), document.baseURI).href;
	},

	fail (error) {
		Log.error("MMM-GestureNav: kļūda", error);
		this.status = `kļūda: ${error && error.message ? error.message : error}`;
		this.renderStatus();
	},

	initWorker () {
		this.worker = new Worker(this.moduleUrl("gesture.worker.js"));

		this.worker.onerror = (event) => this.fail(event.message || "worker kļūda");
		this.worker.onmessage = (event) => {
			const msg = event.data;
			switch (msg.type) {
				case "ready":
					this.workerReady = true;
					this.maybeStartLoop();
					break;
				case "result":
					this.pending = 0;
					this.resultCount = (this.resultCount || 0) + 1;
					if (this.resultCount === 1) Log.log("MMM-GestureNav: pirmais rezultāts no worker'a");
					if (msg.hand && !this.handSeen) {
						this.handSeen = true;
						Log.log("MMM-GestureNav: pirmoreiz atpazīta roka");
					}
					this.handleResult({ landmarks: msg.hand ? [msg.hand] : undefined }, msg.ts);
					break;
				case "info":
					Log.log(`MMM-GestureNav: ${msg.message}`);
					break;
				case "error":
					this.fail(msg.message);
					break;
			}
		};

		this.worker.postMessage({
			type: "init",
			bundleUrl: this.moduleUrl("node_modules/@mediapipe/tasks-vision/vision_bundle.js"),
			wasmDir: this.moduleUrl("node_modules/@mediapipe/tasks-vision/wasm"),
			modelUrl: this.moduleUrl("models/hand_landmarker.task"),
			delegate: this.config.delegate,
			numHands: this.config.numHands
		});
	},

	async startCamera () {
		const video = { width: { ideal: this.config.cameraWidth }, height: { ideal: this.config.cameraHeight } };
		if (this.config.deviceId) video.deviceId = { exact: this.config.deviceId };

		this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });

		this.video = document.createElement("video");
		this.video.autoplay = true;
		this.video.muted = true;
		this.video.playsInline = true;
		this.video.srcObject = this.stream;
		this.video.classList.add("gn-video");

		await new Promise((resolve) => {
			this.video.onloadedmetadata = () => resolve();
		});
		await this.video.play();

		this.cameraReady = true;
		this.attachPreview();
		this.maybeStartLoop();
	},

	maybeStartLoop () {
		if (this.looping || !this.workerReady || !this.cameraReady) return;
		this.looping = true;
		this.frameCount = 0;
		this.resultCount = 0;
		this.status = "meklē roku…";
		this.renderStatus();
		Log.log(`MMM-GestureNav: cilpa sākta (video ${this.video.videoWidth}x${this.video.videoHeight}, readyState ${this.video.readyState})`);

		// Diagnostika: pēc 6 s pārbaudām, vai kadri un rezultāti plūst.
		setTimeout(() => {
			if (this.frameCount === 0) {
				const rs = this.video ? this.video.readyState : "?";
				const dim = this.video ? `${this.video.videoWidth}x${this.video.videoHeight}` : "?";
				Log.warn(`MMM-GestureNav: 6 s bez kadriem — kamera nedod attēlu (readyState ${rs}, ${dim}). Vai Electron ir kameras atļauja?`);
				this.status = "kamera nedod attēlu";
				this.renderStatus();
			} else if (this.resultCount === 0) {
				Log.warn("MMM-GestureNav: kadri tiek sūtīti, bet worker neatbild.");
			} else if (!this.handSeen) {
				Log.log(`MMM-GestureNav: ${this.resultCount} rezultāti, roka vēl nav atpazīta — pietuvini roku, laba gaisma, visa plauksta kadrā.`);
			}
		}, 6000);

		const minInterval = 1000 / this.config.processingFps;
		let last = 0;

		const step = async () => {
			this._raf = requestAnimationFrame(step);
			if (!this.video || this.video.readyState < 2) return;

			const now = performance.now();
			if (now - last < minInterval) return;
			// Viens kadrs vienlaikus; ja worker aizķeries (piem. modeļa uzsilšana) — atbrīvojam.
			if (this.pending && now - this.pending < 4000) return;
			last = now;

			let bitmap;
			try {
				const w = this.config.analysisWidth;
				const h = Math.round(w * (this.video.videoHeight / this.video.videoWidth || 0.75));
				bitmap = await createImageBitmap(this.video, { resizeWidth: w, resizeHeight: h, resizeQuality: "low" });
			} catch (error) {
				if (!this._bitmapErrLogged) {
					this._bitmapErrLogged = true;
					Log.warn("MMM-GestureNav: createImageBitmap neizdevās", error);
				}
				return;
			}
			this.frameCount += 1;
			if (this.frameCount === 1) Log.log("MMM-GestureNav: pirmais kadrs nosūtīts worker'am");
			// MediaPipe prasa stingri augošus (un veselus) laikspiedolus.
			const ts = Math.max(this.lastTs + 1, Math.round(now));
			this.lastTs = ts;
			this.pending = now;
			this.worker.postMessage({ type: "frame", bitmap, ts }, [bitmap]);
		};

		this._raf = requestAnimationFrame(step);
	},

	// Cik pirkstu (rādītājs, vidējais, zeltnesis, mazais) ir izstiepti.
	// Pirksts "izstiepts", ja tas ir gandrīz taisns: virsotnes–pamata attālums
	// tuvu locītavu ceļa garumam (neatkarīgi no rokas pagrieziena).
	extendedFingerCount (lm) {
		const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
		const fingers = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
		let count = 0;
		for (const [mcp, pip, dip, tip] of fingers) {
			const chord = d(lm[mcp], lm[tip]);
			const path = d(lm[mcp], lm[pip]) + d(lm[pip], lm[dip]) + d(lm[dip], lm[tip]);
			if (path > 0 && chord / path > 0.82) count += 1;
		}
		return count;
	},

	// Bakets 0..3 = izstieptu pirkstu skaits; 5 = atvērta plauksta.
	fingerBucket (lm) {
		const n = this.extendedFingerCount(lm);
		return n >= this.config.palmMinFingers ? 5 : n;
	},

	bucketLabel (b) {
		if (b === 5) return "✋ plauksta";
		if (b === 0) return "dūre";
		if (b === 1) return "1 pirksts";
		if (b < 0) return "…";
		return `${b} pirksti`;
	},

	gestureFor (bucket) {
		const c = this.config;
		switch (bucket) {
			case 1: return c.oneFinger ? { notification: c.oneFinger, payload: c.oneFingerPayload } : null;
			case 2: return c.twoFingers ? { notification: c.twoFingers, payload: c.twoFingersPayload } : null;
			case 3: return c.threeFingers ? { notification: c.threeFingers, payload: c.threeFingersPayload } : null;
			case 5: return c.openPalm ? { notification: c.openPalm, payload: c.openPalmPayload } : null;
			default: return null;
		}
	},

	handleResult (result, now) {
		const landmarks = result.landmarks && result.landmarks[0];

		if (this.canvas && this.config.showPreview) this.drawPreview(landmarks);

		const inCooldown = now - this.lastFireAt < this.config.cooldownMs;

		if (!landmarks) {
			this.track.length = 0;
			if (this.gestureBucket !== -1 && now - this.gestureLastSeen > this.config.graceMs) {
				this.gestureBucket = -1;
				this.gestureSince = 0;
				this.firedBucket = -1;
			}
			if (!inCooldown) this.setLabel("nav rokas");
			return;
		}

		const bucket = this.fingerBucket(landmarks);

		// Debounce: bakets jātur nemainīgs holdMs. Viens mērījuma "lēciens"
		// (< graceMs) taimeri nenullē — CPU inference reizēm kļūdās par 1 kadru.
		if (bucket === this.gestureBucket) {
			this.gestureLastSeen = now;
		} else if (this.gestureBucket === -1 || now - this.gestureLastSeen > this.config.graceMs) {
			this.gestureBucket = bucket;
			this.gestureSince = now;
			this.gestureLastSeen = now;
			this.firedBucket = -1;
		}

		const heldFor = now - this.gestureSince;
		const action = this.gestureFor(this.gestureBucket);

		if (this.config.debug) {
			Log.log(`MMM-GestureNav: bakets=${this.gestureBucket} turēts=${Math.round(heldFor)}ms`
				+ (action ? ` -> ${action.notification}` : " (nav darbības)"));
		}

		if (action && !inCooldown && this.gestureBucket !== this.firedBucket && heldFor >= this.config.holdMs) {
			this.fireAction(action, this.bucketLabel(this.gestureBucket), now);
			this.firedBucket = this.gestureBucket;
			return;
		}

		if (this.config.swipeEnabled && this.detectSwipe(landmarks, now, inCooldown)) return;

		if (!inCooldown) {
			const lbl = this.bucketLabel(this.gestureBucket);
			if (action && this.gestureBucket !== this.firedBucket) {
				const pct = Math.min(100, Math.round(heldFor / this.config.holdMs * 100));
				this.setLabel(`${lbl} ${pct}%`);
			} else {
				this.setLabel(lbl);
			}
		}
	},

	detectSwipe (landmarks, now, inCooldown) {
		this.track.push({ t: now, x: landmarks[9].x });
		const cutoff = now - this.config.swipeWindowMs;
		while (this.track.length && this.track[0].t < cutoff) this.track.shift();
		if (inCooldown || this.track.length < 2) return false;

		const first = this.track[0];
		const lastPt = this.track[this.track.length - 1];
		let dx = lastPt.x - first.x;
		if (this.config.mirror) dx = -dx;
		const dt = (lastPt.t - first.t) / 1000;
		const travel = Math.abs(dx);
		const velocity = dt > 0 ? travel / dt : 0;
		if (travel < this.config.swipeMinTravel || velocity < this.config.swipeMinVelocity) return false;

		const notification = dx > 0 ? this.config.onSwipeRight : this.config.onSwipeLeft;
		if (!notification) return false;
		this.fireAction({ notification }, dx > 0 ? "swipe ▶" : "◀ swipe", now);
		this.track.length = 0;
		return true;
	},

	fireAction (action, tag, now) {
		if (!action || !action.notification) return;
		this.lastFireAt = typeof now === "number" ? now : performance.now();
		const hasPayload = action.payload !== undefined && action.payload !== null;
		this.lastActionLabel = `${tag} → ${action.notification}${hasPayload ? ` ${action.payload}` : ""}`;
		this.setLabel(this.lastActionLabel);
		this.sendNotification(action.notification, action.payload);
		if (this.config.debug) Log.log(`MMM-GestureNav -> ${action.notification}`, action.payload);
	},

	// ---- priekšskatījums ----

	attachPreview () {
		if (!this.vidHolder || !this.video) return;
		if (this.video.parentElement !== this.vidHolder) {
			this.vidHolder.insertBefore(this.video, this.canvas);
		}
		const w = this.config.previewWidth;
		const h = Math.round(w * (this.config.cameraHeight / this.config.cameraWidth));
		this.canvas.width = w;
		this.canvas.height = h;
		this.vidHolder.style.height = `${h}px`;
	},

	drawPreview (landmarks) {
		const ctx = this.canvas.getContext("2d");
		const { width: w, height: h } = this.canvas;
		ctx.clearRect(0, 0, w, h);
		if (!landmarks) return;

		const CONNECTIONS = [
			[0, 1], [1, 2], [2, 3], [3, 4],
			[0, 5], [5, 6], [6, 7], [7, 8],
			[5, 9], [9, 10], [10, 11], [11, 12],
			[9, 13], [13, 14], [14, 15], [15, 16],
			[13, 17], [17, 18], [18, 19], [19, 20],
			[0, 17]
		];
		ctx.strokeStyle = "rgba(124, 204, 255, 0.55)";
		ctx.lineWidth = 2;
		ctx.beginPath();
		for (const [a, b] of CONNECTIONS) {
			ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
			ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
		}
		ctx.stroke();

		ctx.fillStyle = "#7cccff";
		for (const p of landmarks) {
			ctx.beginPath();
			ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
			ctx.fill();
		}
	},

	setLabel (text) {
		const value = text || "aktīvs";
		if (this.labelEl) this.labelEl.textContent = value;
		if (this.statusEl) this.statusEl.textContent = `👋 ${value}`;
	},

	renderStatus () {
		if (this.labelEl) this.labelEl.textContent = this.status;
		if (this.statusEl) this.statusEl.textContent = `👋 ${this.status}`;
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-gesturenav";

		if (!this.config.showPreview) {
			wrapper.className += " small dimmed";
			this.statusEl = document.createElement("span");
			this.statusEl.textContent = `👋 ${this.status || ""}`;
			wrapper.appendChild(this.statusEl);
			return wrapper;
		}

		if (!this.previewWrapper) {
			const box = document.createElement("div");
			box.className = "gn-box";
			box.style.width = `${this.config.previewWidth}px`;

			const vidHolder = document.createElement("div");
			vidHolder.className = "gn-vid";
			if (this.config.mirror) vidHolder.classList.add("gn-mirror");

			const canvas = document.createElement("canvas");
			canvas.className = "gn-canvas";
			vidHolder.appendChild(canvas);
			box.appendChild(vidHolder);

			const label = document.createElement("div");
			label.className = "gn-label small";
			label.textContent = this.status || "";
			box.appendChild(label);

			this.previewWrapper = box;
			this.vidHolder = vidHolder;
			this.canvas = canvas;
			this.labelEl = label;

			if (this.video) this.attachPreview();
		}

		wrapper.appendChild(this.previewWrapper);
		return wrapper;
	},

	stop () {
		if (this._raf) cancelAnimationFrame(this._raf);
		if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
		if (this.worker) this.worker.terminate();
	}
});
