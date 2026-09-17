/* MagicMirror² Module: MMM-FaceRecognition
 *
 * Klātbūtnes noteikšana ar tīmekļa kameru + MediaPipe FaceDetector —
 * ieslēdz ekrānu, kad kāds nostājas spoguļa priekšā, un izslēdz to, kad
 * neviena nav ilgāku laiku. NAV identitātes atpazīšana: sejas netiek ne
 * saglabātas, ne salīdzinātas ar kādu datubāzi — tikai "ir/nav seja
 * kadrā" (privātuma un CPU/RAM ziņā daudz lētāk uz Raspberry Pi 5 2 GB).
 *
 * Ekrānu pats modulis neslēdz — to izdara MMM-Remote-Control
 * (`REMOTE_ACTION` -> `MONITORON`/`MONITOROFF`), kam jābūt konfigurētam
 * config.js. Skat. moduļa README.md par uzstādīšanu un noregulēšanu.
 *
 * MediaPipe darbojas atsevišķā Web Worker'ī (face.worker.js) — gan tāpēc,
 * ka tas nesaderas ar MagicMirror globālo `Module`, gan lai neslogotu
 * galveno pavedienu. Viss lokāli (modelis un WASM iekļauti modulī pēc
 * `npm install`). Nepieciešams ELECTRON_ENABLE_GPU=1.
 */
Module.register("MMM-FaceRecognition", {
	defaults: {
		// --- kamera ---
		cameraWidth: 320,
		cameraHeight: 240,
		deviceId: null, // konkrētas kameras id (navigator.mediaDevices.enumerateDevices)

		// --- apstrāde ---
		// Klātbūtnei nevajag augstu FPS — taupa CPU/RAM uz Pi 5 (2 GB RAM).
		processingFps: 2,
		analysisWidth: 192, // kadrs pirms analīzes tiek samazināts līdz šim platumam (px)
		// "CPU" (noklusējums — MagicMirror Electron parasti ir bez WebGL worker'ī)
		// vai "GPU". Ja "GPU" neizdodas, automātiski pārslēdzas uz "CPU".
		delegate: "CPU",
		minDetectionConfidence: 0.5,

		// --- klātbūtnes stāvokļa mašīna ---
		presentHoldMs: 800, // seja jāredz nepārtraukti šo laiku, lai kļūtu "klāt" (izvairās no viena kadra kļūdas)
		absentTimeoutMs: 20000, // pēc tik ilga laika bez sejas -> "prom" (ekrāns izslēdzas)
		cooldownMs: 5000, // minimālais starplaiks starp diviem MONITORON/OFF sūtījumiem (izvairās no mirgošanas)

		// Ko darīt pie katras pārejas. Notifikācija + payload — pēc noklusējuma
		// caur MMM-Remote-Control (jābūt konfigurētam config.js, bez apiKey
		// pietiek, jo šī ir iekšēja notifikācija starp moduļiem, ne HTTP izsaukums).
		onPresent: "REMOTE_ACTION", onPresentPayload: { action: "MONITORON" },
		onAbsent: "REMOTE_ACTION", onAbsentPayload: { action: "MONITOROFF" },

		// --- priekšskatījums (atkļūdošanai) ---
		showPreview: false, // pēc noklusējuma neredzams (modulim nevajag position)
		previewWidth: 200,
		mirror: true,

		debug: false
	},

	getStyles () {
		return ["MMM-FaceRecognition.css"];
	},

	start () {
		this.status = "startē…";
		// Pieņemam, ka sākumā ekrāns jau ir ieslēgts (parasti tā arī ir) —
		// tā pirmā konstatētā pāreja notiek tikai uz "prom", ne lieku "klāt".
		this.state = "present";
		this.faceStreakStart = 0; // kopš kura brīža seja redzama nepārtraukti
		this.lastFaceSeenAt = 0; // pēdējais kadrs, kad seja bija redzama
		// -Infinity, nevis 0: performance.now() jau starta brīdī var būt maza
		// vērtība, un 0 bloķētu pirmo pāreju ar cooldownMs, ja tā notiek ātri.
		this.lastActionAt = -Infinity;
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
		Log.error("MMM-FaceRecognition: kļūda", error);
		this.status = `kļūda: ${error && error.message ? error.message : error}`;
		this.setDot("error");
		this.renderStatus();
	},

	initWorker () {
		this.worker = new Worker(this.moduleUrl("face.worker.js"));

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
					if (this.resultCount === 1) Log.log("MMM-FaceRecognition: pirmais rezultāts no worker'a");
					if (msg.present && !this.faceSeen) {
						this.faceSeen = true;
						Log.log("MMM-FaceRecognition: pirmoreiz konstatēta seja");
					}
					this.handleResult(msg, msg.ts);
					break;
				case "info":
					Log.log(`MMM-FaceRecognition: ${msg.message}`);
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
			modelUrl: this.moduleUrl("models/blaze_face_short_range.tflite"),
			delegate: this.config.delegate,
			minDetectionConfidence: this.config.minDetectionConfidence
		});
	},

	async startCamera () {
		const video = { width: { ideal: this.config.cameraWidth }, height: { ideal: this.config.cameraHeight } };

		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: this.config.deviceId ? { ...video, deviceId: { exact: this.config.deviceId } } : video
			});
		} catch (error) {
			if (!this.config.deviceId) throw error;
			Log.warn(`MMM-FaceRecognition: kamera ${this.config.deviceId} nav pieejama (${error.message}), izmantoju nākamo pieejamo kameru`);
			this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
		}

		this.video = document.createElement("video");
		this.video.autoplay = true;
		this.video.muted = true;
		this.video.playsInline = true;
		this.video.srcObject = this.stream;
		this.video.classList.add("fr-video");

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
		this.status = "meklē klātbūtni…";
		this.renderStatus();
		Log.log(`MMM-FaceRecognition: cilpa sākta (video ${this.video.videoWidth}x${this.video.videoHeight}, readyState ${this.video.readyState})`);

		// Diagnostika: pēc 6 s pārbaudām, vai kadri un rezultāti plūst.
		setTimeout(() => {
			if (this.frameCount === 0) {
				const rs = this.video ? this.video.readyState : "?";
				const dim = this.video ? `${this.video.videoWidth}x${this.video.videoHeight}` : "?";
				Log.warn(`MMM-FaceRecognition: 6 s bez kadriem — kamera nedod attēlu (readyState ${rs}, ${dim}). Vai Electron ir kameras atļauja?`);
				this.status = "kamera nedod attēlu";
				this.renderStatus();
			} else if (this.resultCount === 0) {
				Log.warn("MMM-FaceRecognition: kadri tiek sūtīti, bet worker neatbild.");
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
					Log.warn("MMM-FaceRecognition: createImageBitmap neizdevās", error);
				}
				return;
			}
			this.frameCount += 1;
			if (this.frameCount === 1) Log.log("MMM-FaceRecognition: pirmais kadrs nosūtīts worker'am");
			// MediaPipe prasa stingri augošus (un veselus) laikspiedolus.
			const ts = Math.max(this.lastTs + 1, Math.round(now));
			this.lastTs = ts;
			this.pending = now;
			this.worker.postMessage({ type: "frame", bitmap, ts }, [bitmap]);
		};

		this._raf = requestAnimationFrame(step);
	},

	handleResult (msg, now) {
		this.setDot(msg.present ? "present" : "idle");
		if (this.canvas && this.config.showPreview) this.drawPreview(msg.box, msg.present);

		if (msg.present) {
			if (!this.faceStreakStart) this.faceStreakStart = now;
			this.lastFaceSeenAt = now;

			const heldFor = now - this.faceStreakStart;
			if (this.state !== "present" && heldFor >= this.config.presentHoldMs) {
				this.transition("present", now);
			} else if (this.state !== "present") {
				const pct = Math.min(100, Math.round(heldFor / this.config.presentHoldMs * 100));
				this.setLabel(`klāt ${pct}%`);
			} else {
				this.setLabel("klāt");
			}
			return;
		}

		this.faceStreakStart = 0;

		if (this.state === "present" && this.lastFaceSeenAt) {
			const away = now - this.lastFaceSeenAt;
			if (away >= this.config.absentTimeoutMs) {
				this.transition("absent", now);
			} else {
				const left = Math.max(0, Math.round((this.config.absentTimeoutMs - away) / 1000));
				this.setLabel(`prom ${left}s`);
			}
			return;
		}

		this.setLabel("nav sejas");
	},

	transition (state, now) {
		if (now - this.lastActionAt < this.config.cooldownMs) return; // mēģinās nākamajā kadrā
		this.state = state;
		this.lastActionAt = now;

		const notification = state === "present" ? this.config.onPresent : this.config.onAbsent;
		const payload = state === "present" ? this.config.onPresentPayload : this.config.onAbsentPayload;

		this.setLabel(state === "present" ? "klāt → ekrāns ieslēgts" : "prom → ekrāns izslēgts");
		if (notification) this.sendNotification(notification, payload);
		if (this.config.debug) Log.log(`MMM-FaceRecognition -> ${state} (${notification})`, payload);
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

	drawPreview (box, present) {
		const ctx = this.canvas.getContext("2d");
		const { width: w, height: h } = this.canvas;
		ctx.clearRect(0, 0, w, h);
		if (!box) return;

		ctx.strokeStyle = present ? "rgba(124, 204, 255, 0.75)" : "rgba(150, 150, 150, 0.4)";
		ctx.lineWidth = 2;
		ctx.strokeRect(box.originX * w, box.originY * h, box.width * w, box.height * h);
	},

	setLabel (text) {
		const value = text || "aktīvs";
		if (this.labelEl) this.labelEl.textContent = value;
		if (this.statusEl) this.statusEl.textContent = `🧑 ${value}`;
	},

	renderStatus () {
		if (this.labelEl) this.labelEl.textContent = this.status;
		if (this.statusEl) this.statusEl.textContent = `🧑 ${this.status}`;
	},

	// state: "idle" (nav sejas), "present" (seja konstatēta), "error"
	setDot (state) {
		if (!this.dotEl) return;
		this.dotEl.classList.remove("fr-present", "fr-error");
		if (state === "present" || state === "error") this.dotEl.classList.add(`fr-${state}`);
		if (this.vidHolder) this.vidHolder.classList.toggle("fr-active", state === "present");
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-facerecognition";

		if (!this.config.showPreview) {
			wrapper.className += " small dimmed";
			const statusWrap = document.createElement("span");
			statusWrap.className = "fr-status";
			this.dotEl = document.createElement("span");
			this.dotEl.className = "fr-dot";
			this.statusEl = document.createElement("span");
			this.statusEl.textContent = `🧑 ${this.status || ""}`;
			statusWrap.appendChild(this.dotEl);
			statusWrap.appendChild(this.statusEl);
			wrapper.appendChild(statusWrap);
			return wrapper;
		}

		if (!this.previewWrapper) {
			const box = document.createElement("div");
			box.className = "fr-box";
			box.style.width = `${this.config.previewWidth}px`;

			const vidHolder = document.createElement("div");
			vidHolder.className = "fr-vid";
			if (this.config.mirror) vidHolder.classList.add("fr-mirror");

			const canvas = document.createElement("canvas");
			canvas.className = "fr-canvas";
			vidHolder.appendChild(canvas);
			box.appendChild(vidHolder);

			const label = document.createElement("div");
			label.className = "fr-label small";
			this.dotEl = document.createElement("span");
			this.dotEl.className = "fr-dot";
			this.labelEl = document.createElement("span");
			this.labelEl.textContent = this.status || "";
			label.appendChild(this.dotEl);
			label.appendChild(this.labelEl);
			box.appendChild(label);

			this.previewWrapper = box;
			this.vidHolder = vidHolder;
			this.canvas = canvas;

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
