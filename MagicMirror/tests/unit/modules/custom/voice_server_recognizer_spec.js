/* Vienībtesti MMM-VoiceCommands lokālajai atpazīšanai (Path B): runas
 * segmentētājs, WAV galvene, whisper izvades tīrīšana. Bez mikrofona. */
const path = require("node:path");

const { Segmenter, wavFromPcm, cleanTranscript, expandPath, recorderCommand } = require(path.resolve(__dirname, "../../../../modules/MMM-VoiceCommands/server-recognizer.js"));

/**
 * PCM (16 kHz, S16_LE) ar sinusoīdu vai klusumu.
 * @param {number} ms - Ilgums milisekundēs.
 * @param {number} amplitude - Amplitūda (0 = klusums).
 * @returns {Buffer} PCM dati.
 */
function pcm (ms, amplitude) {
	const n = Math.round(16000 * ms / 1000);
	const buf = Buffer.alloc(n * 2);
	for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(amplitude * Math.sin(i / 5)), i * 2);
	return buf;
}

describe("MMM-VoiceCommands server-recognizer", () => {
	describe("Segmenter", () => {
		it("izdala vienu izteikumu starp klusuma posmiem", () => {
			const seg = new Segmenter();
			const out = [
				...seg.push(pcm(1000, 50)),
				...seg.push(pcm(800, 8000)),
				...seg.push(pcm(1000, 50))
			];
			expect(out).toHaveLength(1);
			const ms = out[0].length / 2 / 16;
			// runa (800 ms) + pre-roll + klusuma aste, bet ne viss ieraksts
			expect(ms).toBeGreaterThan(800);
			expect(ms).toBeLessThan(2200);
		});

		it("ignorē īsu klikšķi", () => {
			const seg = new Segmenter();
			const out = [...seg.push(pcm(500, 50)), ...seg.push(pcm(120, 9000)), ...seg.push(pcm(1500, 50))];
			expect(out).toHaveLength(0);
		});

		it("apgriež pārāk garu izteikumu", () => {
			const seg = new Segmenter({ maxUtteranceMs: 2000 });
			const out = seg.push(pcm(5000, 8000));
			expect(out.length).toBeGreaterThanOrEqual(2);
		});

		it("strādā arī, ja dati pienāk nevienādos gabalos", () => {
			const seg = new Segmenter();
			const all = Buffer.concat([pcm(600, 50), pcm(700, 8000), pcm(1000, 50)]);
			const out = [];
			for (let i = 0; i < all.length; i += 777) out.push(...seg.push(all.subarray(i, i + 777)));
			expect(out).toHaveLength(1);
		});
	});

	it("wavFromPcm uzraksta 16 kHz mono WAV galveni", () => {
		const wav = wavFromPcm(Buffer.alloc(3200));
		expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
		expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
		expect(wav.readUInt32LE(24)).toBe(16000);
		expect(wav.readUInt16LE(22)).toBe(1);
		expect(wav.readUInt32LE(40)).toBe(3200);
		expect(wav).toHaveLength(3244);
	});

	it("cleanTranscript noņem laika zīmogus un trokšņu marķierus", () => {
		expect(cleanTranscript("[00:00:00.000 --> 00:00:02.000]  Spoguli, parādi ziņas.\n")).toBe("Spoguli, parādi ziņas.");
		expect(cleanTranscript(" [BLANK_AUDIO]\n")).toBe("");
		expect(cleanTranscript("(mūzika) Spoguli *klauvē* nākamā dziesma")).toBe("Spoguli nākamā dziesma");
	});

	it("expandPath izvērš ~ un relatīvus ceļus", () => {
		expect(expandPath("~/x", "/mm")).toMatch(/\/x$/);
		expect(expandPath("~/x", "/mm").startsWith("~")).toBe(false);
		expect(expandPath("models/a.bin", "/mm")).toBe("/mm/models/a.bin");
		expect(expandPath("/abs/a.bin", "/mm")).toBe("/abs/a.bin");
	});

	describe("recorderCommand", () => {
		const only = (...names) => (name) => (names.includes(name) ? `/bin/${name}` : null);

		it("Linux (Pi) izmanto arecord ar norādīto ierīci", () => {
			const r = recorderCommand("plughw:1,0", "linux", only("arecord"));
			expect(r.cmd).toBe("/bin/arecord");
			expect(r.args).toEqual(expect.arrayContaining(["-D", "plughw:1,0", "-r", "16000", "-c", "1", "-t", "raw"]));
		});

		it("macOS dod priekšroku sox, citādi ffmpeg", () => {
			const sox = recorderCommand("default", "darwin", only("sox", "ffmpeg"));
			expect(sox.cmd).toBe("/bin/sox");
			expect(sox.args).toEqual(expect.arrayContaining(["-d", "-r", "16000", "-e", "signed-integer", "-L", "-"]));
			const ff = recorderCommand("default", "darwin", only("ffmpeg"));
			expect(ff.cmd).toBe("/bin/ffmpeg");
			expect(ff.args).toEqual(expect.arrayContaining(["avfoundation", ":default", "s16le"]));
		});

		it("atgriež null, ja ierakstīšanas programmas nav", () => {
			expect(recorderCommand("default", "darwin", only())).toBeNull();
			expect(recorderCommand("default", "linux", only("sox"))).toBeNull();
		});
	});
});

describe("MMM-VoiceCommands node_helper serverOptions", () => {
	const HELPER_PATH = path.resolve(__dirname, "../../../../modules/MMM-VoiceCommands/node_helper.js");
	const NodeModule = require("node:module");
	let helper;
	let savedConfig;

	beforeEach(() => {
		delete require.cache[HELPER_PATH];
		const originalRequire = NodeModule.prototype.require;
		NodeModule.prototype.require = function (id) {
			if (id === "node_helper") return { create: (def) => def };
			if (id === "logger") return { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
			return originalRequire.apply(this, arguments);
		};
		try {
			helper = require(HELPER_PATH);
		} finally {
			NodeModule.prototype.require = originalRequire;
		}
		savedConfig = global.config;
		global.config = {
			modules: [
				{ module: "clock" },
				{ module: "MMM-VoiceCommands", config: { server: { whisperBin: "/opt/whisper-cli", model: "/opt/model.bin", device: "plughw:1,0" } } }
			]
		};
	});

	afterEach(() => {
		global.config = savedConfig;
	});

	it("ceļus ņem no config.js, ne no pārlūka ziņas", () => {
		const options = helper.serverOptions({ whisperBin: "/bin/sh", model: "/etc/passwd", device: "evil", language: "lv", prompt: "Parādi laikapstākļus." });
		expect(options).toEqual({ whisperBin: "/opt/whisper-cli", model: "/opt/model.bin", device: "plughw:1,0", language: "lv", prompt: "Parādi laikapstākļus." });
	});

	it("nederīgu valodu un uzvedni ignorē", () => {
		const options = helper.serverOptions({ language: "-m /bin/sh", prompt: 42 });
		expect(options.language).toBeUndefined();
		expect(options.prompt).toBeUndefined();
	});

	it("bez server sadaļas — recognizer noklusējumi", () => {
		global.config = { modules: [{ module: "MMM-VoiceCommands" }] };
		expect(helper.serverOptions({ language: "lv" })).toEqual({ language: "lv" });
	});
});
