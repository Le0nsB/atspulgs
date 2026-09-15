/* MMM-FaceRecognition — Web Worker.
 *
 * Klātbūtnes noteikšanai (NEVIS identitātes atpazīšanai — sejas netiek ne
 * saglabātas, ne salīdzinātas ar kādu datubāzi) izmanto MediaPipe
 * `FaceDetector` ar modeli `blaze_face_short_range` — vieglāko no MediaPipe
 * sejas modeļiem, paredzēts ~2 m attālumam (tieši spoguļa lietošanas
 * gadījumam) un daudz lētāku CPU/RAM ziņā nekā pilna seju atpazīšana.
 *
 * Darbojas atsevišķā Worker'ī tā paša iemesla dēļ kā MMM-GestureNav:
 * MediaPipe pieņem, ka `self.Module` nav definēts, bet MagicMirror to
 * definē globāli galvenajā pavedienā — sadursme sabojā abus. Worker'ī arī
 * neslogo galveno pavedienu (svarīgi uz Raspberry Pi).
 *
 * Izmanto IMAGE režīmu (katrs kadrs neatkarīgs, pilnībā sinhrons — nav
 * VIDEO režīma iekšējās sekošanas rindas, kas bez GPU aug neierobežoti).
 *
 * Galvenais pavediens sūta ImageBitmap kadrus; worker atsūta atpakaļ tikai
 * to, vai konstatēta klātbūtne (+ normalizēts rāmītis priekšskatam).
 */
/* global importScripts */

let detector = null;
let ready = false;

self.onmessage = async (event) => {
	const msg = event.data;

	if (msg.type === "init") {
		try {
			importScripts(msg.bundleUrl); // izveido self.Vision
			const { FilesetResolver, FaceDetector } = self.Vision;

			const fileset = await FilesetResolver.forVisionTasks(msg.wasmDir);
			const build = (delegate) => FaceDetector.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: msg.modelUrl, delegate },
				runningMode: "IMAGE",
				minDetectionConfidence: msg.minDetectionConfidence
			});

			try {
				detector = await build(msg.delegate);
			} catch (error) {
				detector = await build("CPU");
				self.postMessage({ type: "info", message: `${msg.delegate} nav pieejams, izmantoju CPU` });
			}

			ready = true;
			self.postMessage({ type: "ready" });
			self.postMessage({ type: "info", message: "FaceDetector gatavs (IMAGE režīms)" });
		} catch (error) {
			self.postMessage({ type: "error", message: String(error && error.message ? error.message : error) });
		}
		return;
	}

	if (msg.type === "frame") {
		const bitmap = msg.bitmap;
		if (!ready || !detector) {
			if (bitmap && bitmap.close) bitmap.close();
			return;
		}

		const w = bitmap.width;
		const h = bitmap.height;

		let result;
		try {
			result = detector.detect(bitmap);
		} catch (error) {
			if (bitmap && bitmap.close) bitmap.close();
			const em = error && error.message ? error.message : String(error);
			if (!self._detectOk) {
				// Pirmais kadrs jau krīt — parasti nav WebGL (MediaPipe to prasa
				// arī CPU inference attēla sagatavošanai).
				const gl = /activeTexture|WebGL|GL context|getContext|createContext/i.test(em);
				self.postMessage({
					type: "error",
					message: gl
						? "nav WebGL — palaid MagicMirror ar ELECTRON_ENABLE_GPU=1"
						: `detect() kļūda: ${em}`
				});
			} else if (!self._detectErrLogged) {
				self._detectErrLogged = true;
				self.postMessage({ type: "info", message: `detect() kļūda: ${em}` });
			}
			self.postMessage({ type: "result", ts: msg.ts, present: false, box: null });
			return;
		}
		if (bitmap && bitmap.close) bitmap.close();

		if (!self._detectOk) {
			self._detectOk = true;
			const n = result.detections ? result.detections.length : 0;
			self.postMessage({ type: "info", message: `pirmais detect() ok, sejas kadrā: ${n}` });
		}

		const best = result.detections && result.detections[0];
		// Normalizējam uz 0..1 (kadra daļas), lai priekšskats var zīmēt jebkurā izmērā.
		const box = best && best.boundingBox
			? {
				originX: best.boundingBox.originX / w,
				originY: best.boundingBox.originY / h,
				width: best.boundingBox.width / w,
				height: best.boundingBox.height / h
			}
			: null;

		self.postMessage({ type: "result", ts: msg.ts, present: !!best, box });
	}
};
