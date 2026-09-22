/* MMM-GestureNav — Web Worker.
 *
 * MediaPipe jāpalaiž atsevišķā worker'ī, jo:
 *   1) MagicMirror definē globālo `Module` (moduļu bāzes klase), bet
 *      MediaPipe komplekts pieņem, ka `self.Module` nav definēts
 *      (`self.ModuleFactory(self.Module || i)`) — sadursme sabojā abus.
 *   2) Roku atpazīšana neslogo galveno pavedienu (svarīgi uz Raspberry Pi).
 *
 * Izmanto `HandLandmarker` IMAGE režīmā (katrs kadrs neatkarīgs, pilnībā
 * sinhrons). VIDEO režīms uztur iekšēju sekošanas cilpu (GateCalculator ->
 * norm_rect), kas bez GPU uzkrāj neierobežotu rindu; IMAGE režīmā tādas nav.
 * "Atvērtu plaukstu" atpazīst pats modulis no 21 punkta ģeometrijas.
 *
 * Galvenais pavediens sūta `ImageBitmap` kadrus; worker atsūta atpakaļ
 * tikai vienas rokas punktus.
 */
/* global importScripts */

let landmarker = null;
let ready = false;

self.onmessage = async (event) => {
	const msg = event.data;

	if (msg.type === "init") {
		try {
			importScripts(msg.bundleUrl); // izveido self.Vision
			const { FilesetResolver, HandLandmarker } = self.Vision;

			const fileset = await FilesetResolver.forVisionTasks(msg.wasmDir);
			const build = (delegate) => HandLandmarker.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: msg.modelUrl, delegate },
				runningMode: "IMAGE",
				numHands: msg.numHands
			});

			try {
				landmarker = await build(msg.delegate);
			} catch (error) {
				landmarker = await build("CPU");
				self.postMessage({ type: "info", message: `${msg.delegate} nav pieejams, izmantoju CPU` });
			}

			ready = true;
			self.postMessage({ type: "ready" });
			self.postMessage({ type: "info", message: "HandLandmarker gatavs (IMAGE režīms)" });
		} catch (error) {
			self.postMessage({ type: "error", message: String(error && error.message ? error.message : error) });
		}
		return;
	}

	if (msg.type === "frame") {
		const bitmap = msg.bitmap;
		if (!ready || !landmarker) {
			if (bitmap && bitmap.close) bitmap.close();
			return;
		}

		let result;
		try {
			result = landmarker.detect(bitmap);
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
			self.postMessage({ type: "result", ts: msg.ts, hand: null });
			return;
		}
		if (bitmap && bitmap.close) bitmap.close();

		if (!self._detectOk) {
			self._detectOk = true;
			const n = result.landmarks ? result.landmarks.length : 0;
			self.postMessage({ type: "info", message: `pirmais detect() ok, rokas kadrā: ${n}` });
		}

		const hand = result.landmarks && result.landmarks[0]
			? result.landmarks[0].map((p) => ({ x: p.x, y: p.y }))
			: null;

		self.postMessage({ type: "result", ts: msg.ts, hand });
	}
};
