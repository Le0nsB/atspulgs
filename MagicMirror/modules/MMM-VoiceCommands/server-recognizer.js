/* MMM-VoiceCommands — lokāla runas atpazīšana uz Pi (Path B)
 *
 *   mikrofons -> arecord (Linux/Pi) vai sox/ffmpeg (macOS) (16 kHz mono PCM) -> balss aktivitātes detektors
 *   (enerģijas slieksnis) -> katrs izteikums kā WAV -> whisper.cpp -> teksts.
 *
 * Teksts tālāk iet uz to pašu aktivācijas vārda + komandu sakritības loģiku
 * pārlūka pusē (MMM-VoiceCommands.js, loma "server"), tāpēc komandas,
 * "Spoguli" un malu mirdzums strādā tieši tāpat kā ar Web Speech API.
 *
 * Viss notiek lokāli — nav vajadzīgs internets vai Google runas serveris.
 * Šeit nav MagicMirror atkarību, lai segmentētāju var testēt atsevišķi.
 */
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // S16_LE

/* ------------------------- balss aktivitātes detektors ------------------------- */

// Sadala nepārtrauktu PCM plūsmu atsevišķos izteikumos pēc skaļuma:
// runa sākas, kad vairāki kadri pēc kārtas ir skaļāki par fona trokšņa
// līmeni × startRatio, un beidzas pēc `silenceMs` klusuma. Fona līmenis
// pielāgojas pats (ventilators, ledusskapis u.tml.).
class Segmenter {
	constructor (opts = {}) {
		this.frameMs = opts.frameMs || 30;
		this.frameBytes = Math.round(SAMPLE_RATE * this.frameMs / 1000) * BYTES_PER_SAMPLE;
		this.minRms = opts.minRms ?? 300; // absolūtais minimums (0..32767); klusa balss no ~1–2 m ir ~300–1000
		this.startRatio = opts.startRatio ?? 3;
		this.startFrames = opts.startFrames ?? 3; // ~90 ms skaļuma, lai sāktu
		this.silenceFrames = Math.ceil((opts.silenceMs ?? 700) / this.frameMs);
		this.preRollFrames = Math.ceil((opts.preRollMs ?? 300) / this.frameMs);
		this.minSpeechFrames = Math.ceil((opts.minSpeechMs ?? 250) / this.frameMs);
		this.maxFrames = Math.ceil((opts.maxUtteranceMs ?? 8000) / this.frameMs);

		this.noise = opts.initialNoise ?? this.minRms / this.startRatio;
		this.rest = Buffer.alloc(0);
		this.preRoll = [];
		this.loudRun = 0;
		this.inSpeech = false;
		this.frames = [];
		this.voiced = 0;
		this.quiet = 0;
	}

	static rms (frame) {
		let sum = 0;
		const n = frame.length / BYTES_PER_SAMPLE;
		for (let i = 0; i < frame.length; i += BYTES_PER_SAMPLE) {
			const s = frame.readInt16LE(i);
			sum += s * s;
		}
		return n ? Math.sqrt(sum / n) : 0;
	}

	threshold () {
		return Math.max(this.minRms, this.noise * this.startRatio);
	}

	// Pieņem jebkura garuma PCM gabalu; atgriež pabeigto izteikumu masīvu (Buffer).
	push (chunk) {
		const out = [];
		let data = this.rest.length ? Buffer.concat([this.rest, chunk]) : chunk;
		let offset = 0;
		while (data.length - offset >= this.frameBytes) {
			const frame = data.subarray(offset, offset + this.frameBytes);
			offset += this.frameBytes;
			const seg = this.pushFrame(Buffer.from(frame));
			if (seg) out.push(seg);
		}
		this.rest = Buffer.from(data.subarray(offset));
		return out;
	}

	pushFrame (frame) {
		const level = Segmenter.rms(frame);
		const loud = level >= this.threshold();

		if (!this.inSpeech) {
			// Fona līmeni mācāmies tikai no nerunas kadriem.
			if (!loud) this.noise = this.noise * 0.95 + level * 0.05;
			this.preRoll.push(frame);
			if (this.preRoll.length > this.preRollFrames + this.startFrames) this.preRoll.shift();
			this.loudRun = loud ? this.loudRun + 1 : 0;
			if (this.loudRun >= this.startFrames) {
				this.inSpeech = true;
				this.frames = this.preRoll;
				this.preRoll = [];
				this.voiced = this.loudRun;
				this.quiet = 0;
			}
			return null;
		}

		this.frames.push(frame);
		if (loud) {
			this.voiced += 1;
			this.quiet = 0;
		} else {
			this.quiet += 1;
		}
		if (this.quiet >= this.silenceFrames || this.frames.length >= this.maxFrames) {
			return this.finish();
		}
		return null;
	}

	finish () {
		const frames = this.frames;
		const voiced = this.voiced;
		this.inSpeech = false;
		this.frames = [];
		this.voiced = 0;
		this.quiet = 0;
		this.loudRun = 0;
		if (voiced < this.minSpeechFrames) return null; // klikšķis / klauvējiens, ne runa
		return Buffer.concat(frames);
	}
}

/* ----------------------------------- WAV ----------------------------------- */

function wavFromPcm (pcm) {
	const header = Buffer.alloc(44);
	header.write("RIFF", 0);
	header.writeUInt32LE(36 + pcm.length, 4);
	header.write("WAVE", 8);
	header.write("fmt ", 12);
	header.writeUInt32LE(16, 16); // PCM fmt bloka garums
	header.writeUInt16LE(1, 20); // PCM
	header.writeUInt16LE(1, 22); // mono
	header.writeUInt32LE(SAMPLE_RATE, 24);
	header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
	header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
	header.writeUInt16LE(16, 34);
	header.write("data", 36);
	header.writeUInt32LE(pcm.length, 40);
	return Buffer.concat([header, pcm]);
}

// whisper.cpp izvade -> tīrs teksts. Noņem laika zīmogus un trokšņu
// marķierus ("[BLANK_AUDIO]", "(mūzika)", "*klauvē*").
function cleanTranscript (stdout) {
	return String(stdout || "")
		.split("\n")
		.map((line) => line.replace(/^\s*\[[\d:.,\s\->]+\]\s*/, ""))
		.join(" ")
		.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

// Meklē programmu PATH un Homebrew mapēs (Electron, kas palaists ne no
// termināļa, var nesaņemt /opt/homebrew/bin savā PATH).
function findExecutable (name, env = process.env) {
	const dirs = [...String(env.PATH || "").split(path.delimiter), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
	for (const dir of dirs) {
		if (!dir) continue;
		const file = path.join(dir, name);
		try {
			fs.accessSync(file, fs.constants.X_OK);
			return file;
		} catch {
			// nav šeit
		}
	}
	return null;
}

// Ierakstīšanas komanda: 16 kHz, mono, 16-bit little-endian PCM uz stdout.
//   Linux (Pi): arecord (alsa-utils)
//   macOS:      sox (`brew install sox`) vai ffmpeg (`brew install ffmpeg`)
function recorderCommand (device = "default", platform = process.platform, find = findExecutable) {
	if (platform === "darwin") {
		const sox = find("sox");
		if (sox) {
			const input = device && device !== "default" ? ["-t", "coreaudio", device] : ["-d"];
			return { cmd: sox, args: ["-q", ...input, "-t", "raw", "-r", String(SAMPLE_RATE), "-c", "1", "-b", "16", "-e", "signed-integer", "-L", "-"] };
		}
		const ffmpeg = find("ffmpeg");
		if (ffmpeg) {
			const input = `:${device && device !== "default" ? device : "default"}`;
			return { cmd: ffmpeg, args: ["-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", input, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", "-"] };
		}
		return null;
	}
	const arecord = find("arecord");
	if (!arecord) return null;
	return { cmd: arecord, args: ["-D", device, "-f", "S16_LE", "-r", String(SAMPLE_RATE), "-c", "1", "-t", "raw", "-q"] };
}

function expandPath (p, root) {
	if (!p) return p;
	if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
	return path.isAbsolute(p) ? p : path.resolve(root, p);
}

/* ------------------------------- atpazinējs ------------------------------- */

// Notikumi (callbacks): onTranscript(text), onStatus({ ok, message }).
class ServerRecognizer {
	constructor (opts, { onTranscript, onStatus, log, root }) {
		this.log = log || console;
		this.root = root || process.cwd();
		this.onTranscript = onTranscript;
		this.onStatus = onStatus;
		this.opts = {
			device: "default",
			whisperBin: "~/whisper.cpp/build/bin/whisper-cli",
			model: "~/whisper.cpp/models/ggml-small-q5_1.bin",
			language: "lv",
			threads: 4,
			prompt: "",
			timeoutMs: 20000,
			...opts
		};
		this.opts.whisperBin = expandPath(this.opts.whisperBin, this.root);
		// Norādītā ceļa nav (piem. Mac ar `brew install whisper-cpp`) — meklējam PATH.
		if (!fs.existsSync(this.opts.whisperBin)) this.opts.whisperBin = findExecutable("whisper-cli") || this.opts.whisperBin;
		this.opts.model = expandPath(this.opts.model, this.root);
		this.segmenter = new Segmenter(this.opts.vad || {});
		this.proc = null;
		this.stopped = false;
		this.busy = false;
		this.pending = null; // jaunākais izteikums, kas gaida, kamēr whisper aizņemts
		this.restartDelay = 2000;
		this.restartTimer = null;
		this.counter = 0;
	}

	status (ok, message) {
		if (this.onStatus) this.onStatus({ ok, message });
	}

	start () {
		this.stopped = false;
		if (!fs.existsSync(this.opts.whisperBin)) {
			this.status(false, "whisper.cpp nav uzstādīts");
			this.log.error(`MMM-VoiceCommands: nav atrasts ${this.opts.whisperBin} — skat. scripts/whisper/install.sh`);
			return false;
		}
		if (!fs.existsSync(this.opts.model)) {
			this.status(false, "Nav whisper modeļa");
			this.log.error(`MMM-VoiceCommands: nav atrasts modelis ${this.opts.model} — skat. scripts/whisper/install.sh`);
			return false;
		}
		this.recorder = recorderCommand(this.opts.device);
		if (!this.recorder) {
			const hint = process.platform === "darwin" ? "brew install sox" : "sudo apt install alsa-utils";
			this.status(false, `Nav ierakstīšanas programmas (${hint})`);
			this.log.error(`MMM-VoiceCommands: nav atrasts ${process.platform === "darwin" ? "sox/ffmpeg" : "arecord"} — ${hint}`);
			return false;
		}
		this.startRecorder();
		// Pirmā whisper palaišana ielādē modeli (Mac: arī Metal) — var aizņemt
		// ~30 s. Izdarām to uzreiz uz klusuma, nevis pie pirmā "Spoguli".
		this.transcribe(Buffer.alloc(SAMPLE_RATE * BYTES_PER_SAMPLE), { warmup: true });
		return true;
	}

	stop () {
		this.stopped = true;
		clearTimeout(this.restartTimer);
		if (this.proc) this.proc.kill();
		this.proc = null;
	}

	startRecorder () {
		if (this.stopped || this.proc) return;
		const { cmd, args } = this.recorder;
		const name = path.basename(cmd);
		let proc;
		try {
			proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
		} catch (err) {
			this.recorderFailed(`${name}: ${err.message}`);
			return;
		}
		this.proc = proc;
		let stderr = "";
		let gotAudio = false;
		proc.stdout.on("data", (chunk) => {
			if (!gotAudio) {
				gotAudio = true;
				this.restartDelay = 2000;
				this.status(true, "");
				this.log.info(`MMM-VoiceCommands: mikrofons (${name}, ${this.opts.device}) klausās`);
			}
			for (const seg of this.segmenter.push(chunk)) this.enqueue(seg);
		});
		proc.stderr.on("data", (d) => {
			stderr = (stderr + d.toString()).slice(-500);
		});
		proc.on("error", (err) => {
			this.proc = null;
			this.recorderFailed(`${name}: ${err.message}`);
		});
		proc.on("close", (code) => {
			if (this.proc !== proc) return;
			this.proc = null;
			if (this.stopped) return;
			this.recorderFailed(`${name} beidzās (${code}) ${stderr.trim()}`);
		});
	}

	// Mikrofons atvienots / aizņemts — mēģinām atkal ar pieaugošu pauzi.
	recorderFailed (reason) {
		this.log.warn(`MMM-VoiceCommands: ${reason}`);
		this.status(false, "Nav mikrofona");
		if (this.stopped) return;
		clearTimeout(this.restartTimer);
		this.restartTimer = setTimeout(() => this.startRecorder(), this.restartDelay);
		this.restartDelay = Math.min(this.restartDelay * 2, 60000);
	}

	enqueue (pcm) {
		if (this.busy) {
			this.pending = pcm; // vecāks gaidošais izteikums vairs nav aktuāls
			return;
		}
		this.transcribe(pcm);
	}

	transcribe (pcm, { warmup = false } = {}) {
		this.busy = true;
		const file = path.join(os.tmpdir(), `mmm-voice-${process.pid}-${this.counter++ % 4}.wav`);
		fs.writeFileSync(file, wavFromPcm(pcm));
		const args = ["-m", this.opts.model, "-f", file, "-l", this.opts.language, "-t", String(this.opts.threads), "-nt", "-np"];
		if (this.opts.prompt) args.push("--prompt", this.opts.prompt);
		const started = Date.now();
		execFile(this.opts.whisperBin, args, { timeout: this.opts.timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
			fs.unlink(file, () => {});
			if (err) {
				this.log.error(`MMM-VoiceCommands: whisper kļūda: ${err.message}`);
			} else if (warmup) {
				this.log.info(`MMM-VoiceCommands: whisper gatavs (${Date.now() - started} ms)`);
			} else {
				const text = cleanTranscript(stdout);
				if (text) {
					this.log.info(`MMM-VoiceCommands: dzirdēts "${text}" (${Date.now() - started} ms)`);
					if (this.onTranscript) this.onTranscript(text);
				}
			}
			this.busy = false;
			const next = this.pending;
			this.pending = null;
			if (next) this.transcribe(next);
		});
	}
}

module.exports = { Segmenter, ServerRecognizer, wavFromPcm, cleanTranscript, expandPath, recorderCommand, findExecutable };
