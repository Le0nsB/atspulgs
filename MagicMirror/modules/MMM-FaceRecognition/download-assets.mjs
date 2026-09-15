/* Lejupielādē MediaPipe sejas detektora modeli (blaze_face_short_range.tflite).
 * Palaižas automātiski pēc `npm install` (postinstall). Ja fails jau ir —
 * neko nedara. Ja nav interneta — brīdina, bet neļauj `npm install` krist.
 */
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, "models", "blaze_face_short_range.tflite");
const url
	= "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

if (existsSync(dest)) {
	console.log(`[MMM-FaceRecognition] modelis jau ir: ${dest}`);
	process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });

try {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	await writeFile(dest, buf);
	console.log(`[MMM-FaceRecognition] modelis lejupielādēts (${buf.length} B): ${dest}`);
} catch (error) {
	console.warn(`[MMM-FaceRecognition] neizdevās lejupielādēt modeli: ${error.message}`);
	console.warn("  Lejupielādē to manuāli:");
	console.warn(`  curl -L -o "${dest}" \\`);
	console.warn(`    "${url}"`);
	process.exit(0);
}
