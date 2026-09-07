/* Lejupielādē MediaPipe rokas punktu modeli (hand_landmarker.task).
 * Palaižas automātiski pēc `npm install` (postinstall). Ja fails jau ir —
 * neko nedara. Ja nav interneta — brīdina, bet neļauj `npm install` krist.
 */
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, "models", "hand_landmarker.task");
const url
	= "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

if (existsSync(dest)) {
	console.log(`[MMM-GestureNav] modelis jau ir: ${dest}`);
	process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });

try {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	await writeFile(dest, buf);
	console.log(`[MMM-GestureNav] modelis lejupielādēts (${buf.length} B): ${dest}`);
} catch (error) {
	console.warn(`[MMM-GestureNav] neizdevās lejupielādēt modeli: ${error.message}`);
	console.warn("  Lejupielādē to manuāli:");
	console.warn(`  curl -L -o "${dest}" \\`);
	console.warn(`    "${url}"`);
	process.exit(0);
}
