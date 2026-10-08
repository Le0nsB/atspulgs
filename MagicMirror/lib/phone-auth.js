/* Telefonu pieslēgšana spogulim (kopīga MMM-TodoList, MMM-Routines,
 * MMM-GoogleCalendar, MMM-SpotifyNowPlaying un MMM-SignOut telefona lapām).
 *
 * Problēma: MagicMirror ipWhitelist atļauj VISU mājas tīklu, tāpēc bez šī
 * jebkura ierīce tīklā (vai skripts) varētu mainīt sarakstus, treniņus,
 * Google kalendāru un Spotify pieslēgumu.
 *
 * Risinājums — "redzi spoguli = drīksti to vadīt" (tāpat kā hotspot parole):
 *   1. Spoguļa ekrānā QR kods ved uz /pair?code=<pieslēgšanās kods>&next=/todo.
 *      Kodu saņem TIKAI spoguļa paša Electron logs (loopback) — citas ierīces,
 *      kas atvērušas spoguļa lapu, saņem adresi bez koda (sendPhoneLink).
 *   2. /pair pārbauda kodu un iedod telefonam nejaušu ierīces atslēgu sīkdatnē
 *      (HttpOnly, SameSite=Lax, 1 gads). Serverī glabājas tikai tās SHA-256.
 *   3. Visi telefona API (guard) un lapas (page) pārbauda šo sīkdatni. Bez tās —
 *      401 un lapa "noskenē QR kodu spogulī".
 *   4. Izrakstīšanās (/signout) var aizmirst visus telefonus — tad tiek ģenerēts
 *      arī jauns pieslēgšanās kods (vecais QR koda foto vairs neder).
 *
 * Papildus katrs pieprasījums pārbauda Host galveni (tikai paša spoguļa
 * adreses): aizsargā pret DNS rebinding (sveša vietne, kuras domēns pēkšņi
 * norāda uz spoguļa IP) un neļauj Spotify pieslēgšanai (loginUrl) iedot
 * patvaļīgu atgriešanās adresi.
 *
 * Pieprasījumi no paša Pi (127.0.0.1 / ::1) ir uzticami bez sīkdatnes.
 *
 * Dati: MagicMirror/data/phone-auth.json (tikai īpašniekam lasāms, ārpus
 * modules/, ko MagicMirror atdod pa HTTP).
 *
 * Ierobežojums: MagicMirror socket.io savienojumu (ar ko strādā spoguļa ekrāni
 * un MMM-Remote-Control tālvadība) šis nesargā — to joprojām ierobežo tikai
 * ipWhitelist (skat. dokumentāciju).
 */
const crypto = require("node:crypto");
const EventEmitter = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_FILE = path.join(ROOT, "data", "phone-auth.json");
const PAIR_PAGE = path.join(__dirname, "pair-needed.html");
const COOKIE = "mm_phone";
const COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;
const MAX_DEVICES = 50;
const LAST_SEEN_SAVE_MS = 60 * 60 * 1000;
// Kur /pair drīkst aizsūtīt pēc pieslēgšanas (nekur citur — nav "open redirect").
const NEXT_PAGES = ["/todo", "/calendar", "/spotify", "/routines", "/signout", "/remote.html"];
const NOT_PAIRED = "Šis telefons nav pieslēgts spogulim. Noskenē QR kodu spoguļa ekrānā (saki „Spoguli, parādi uzdevumus”).";

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const randomToken = (bytes) => crypto.randomBytes(bytes).toString("base64url");

/**
 * Vai adrese ir paša Pi (127.0.0.1 / ::1)?
 * @param {string} address - Klienta IP adrese.
 * @returns {boolean} true, ja loopback.
 */
function isLoopback (address) {
	const a = String(address || "");
	return a === "::1" || a.startsWith("127.") || a.startsWith("::ffff:127.");
}

/**
 * Host galvenes saimniekdatora nosaukums bez porta:
 * "192.168.1.5:8080" -> "192.168.1.5", "[::1]:8080" -> "::1", "Spogulis.local." -> "spogulis.local".
 * @param {string} hostHeader - Host galvenes vērtība.
 * @returns {string} nosaukums mazajiem burtiem ("" ja nav).
 */
function hostnameOf (hostHeader) {
	const h = String(hostHeader || "").trim().toLowerCase();
	if (!h) return "";
	const name = h.startsWith("[") ? h.slice(1, h.indexOf("]")) : h.replace(/:\d+$/, "");
	return name.replace(/\.$/, "");
}

/**
 * Visi nosaukumi, ar kuriem telefons var sasniegt šo spoguli. Saskarnes var
 * mainīties (WiFi -> hotspot 10.41.0.1), tāpēc aprēķina katru reizi no jauna.
 * @returns {Set<string>} atļautie Host nosaukumi.
 */
function ownHostnames () {
	const names = new Set(["localhost", "127.0.0.1", "::1"]);
	const host = os.hostname().toLowerCase().replace(/\.local$/, "");
	names.add(host);
	names.add(`${host}.local`);
	for (const addrs of Object.values(os.networkInterfaces())) {
		for (const a of addrs || []) names.add(a.address.toLowerCase().replace(/%.*$/, ""));
	}
	return names;
}

/**
 * Nolasa sīkdatni no pieprasījuma.
 * @param {object} req - Express pieprasījums.
 * @param {string} name - Sīkdatnes nosaukums.
 * @returns {string|null} vērtība vai null.
 */
function readCookie (req, name) {
	for (const part of String(req.headers.cookie || "").split(";")) {
		const i = part.indexOf("=");
		if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
	}
	return null;
}

/**
 * Salīdzina divas virknes laikā, kas nav atkarīgs no satura.
 * @param {string} a - Pirmā virkne.
 * @param {string} b - Otrā virkne.
 * @returns {boolean} true, ja vienādas.
 */
function safeEqual (a, b) {
	const x = Buffer.from(String(a));
	const y = Buffer.from(String(b));
	return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * QR kodu bibliotēka — jau ir MMM-Remote-Control atkarībās. Ja tās nav, spogulis rāda tikai adresi.
 * @returns {object|null} qrcode modulis vai null.
 */
function loadQrCode () {
	for (const id of ["qrcode", path.join(ROOT, "modules", "MMM-Remote-Control", "node_modules", "qrcode")]) {
		try {
			return require(id);
		} catch {
			// mēģina nākamo
		}
	}
	return null;
}

class PhoneAuth extends EventEmitter {
	constructor ({ file = DEFAULT_FILE, now = Date.now, hostnames = ownHostnames, log = console } = {}) {
		super();
		this.file = file;
		this.now = now;
		this.hostnames = hostnames;
		this.log = log;
		this.data = null; // ielādē pie pirmās vajadzības
		this.installedOn = new WeakSet();
	}

	/* ------------------------------ glabāšana ------------------------------ */

	state () {
		if (this.data) return this.data;
		try {
			const d = JSON.parse(fs.readFileSync(this.file, "utf8"));
			if (typeof d.pairCode === "string" && Array.isArray(d.devices)) this.data = d;
		} catch {
			// nav faila vai bojāts — sākam no jauna
		}
		if (!this.data) {
			this.data = { pairCode: randomToken(24), devices: [] };
			this.save();
		}
		return this.data;
	}

	save () {
		try {
			fs.mkdirSync(path.dirname(this.file), { recursive: true });
			fs.writeFileSync(this.file, JSON.stringify(this.data, null, "\t"), { mode: 0o600 });
		} catch (error) {
			this.log.error(`phone-auth: neizdevās saglabāt ${this.file}: ${error.message}`);
		}
	}

	/* ------------------------------ loģika ------------------------------ */

	hostAllowed (req) {
		const name = hostnameOf(req.headers.host);
		return Boolean(name) && this.hostnames().has(name);
	}

	deviceOf (req) {
		const token = readCookie(req, COOKIE);
		if (!token) return null;
		const hash = sha256(token);
		return this.state().devices.find((d) => d.hash === hash) || null;
	}

	isTrusted (req) {
		if (isLoopback(req.socket && req.socket.remoteAddress)) return true;
		const device = this.deviceOf(req);
		if (!device) return false;
		const now = this.now();
		if (now - device.lastSeenAt > LAST_SEEN_SAVE_MS) {
			device.lastSeenAt = now;
			this.save();
		}
		return true;
	}

	// Pareizs kods -> jauna ierīces atslēga (sīkdatnei); nepareizs -> null.
	pair (code, userAgent = "") {
		const data = this.state();
		if (!code || !safeEqual(code, data.pairCode)) return null;
		const token = randomToken(32);
		const now = this.now();
		data.devices.push({ hash: sha256(token), createdAt: now, lastSeenAt: now, userAgent: String(userAgent).slice(0, 200) });
		// Vecākās (sen neredzētās) ierīces izkrīt, lai saraksts neaug bezgalīgi.
		data.devices.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
		data.devices.length = Math.min(data.devices.length, MAX_DEVICES);
		this.save();
		return token;
	}

	// Aizmirst visus telefonus un nomaina pieslēgšanās kodu (QR kodi spogulī jāpārzīmē).
	reset () {
		this.data = { pairCode: randomToken(24), devices: [] };
		this.save();
		this.emit("reset");
	}

	deviceCount () {
		return this.state().devices.length;
	}

	// "http://192.168.1.5:8080/todo" -> "http://192.168.1.5:8080/pair?code=…&next=%2Ftodo"
	pairUrl (pageUrl) {
		const u = new URL(pageUrl);
		return `${u.origin}/pair?${new URLSearchParams({ code: this.state().pairCode, next: u.pathname })}`;
	}

	/* ------------------------------ Express ------------------------------ */

	// Telefona API: pareiza Host galvene + pieslēgts telefons (vai pats Pi).
	guard () {
		return (req, res, next) => {
			if (!this.hostAllowed(req)) return res.status(403).json({ error: "Nepazīstama spoguļa adrese." });
			if (!this.isTrusted(req)) return res.status(401).json({ error: NOT_PAIRED, pair: true });
			return next();
		};
	}

	// Telefona lapa: nepieslēgtam telefonam tās vietā parāda "noskenē QR kodu".
	page (file) {
		return (req, res) => {
			res.set("Cache-Control", "no-cache");
			if (!this.hostAllowed(req)) return res.status(403).send("Nepazīstama spoguļa adrese.");
			if (!this.isTrusted(req)) return res.status(401).sendFile(PAIR_PAGE);
			return res.sendFile(file);
		};
	}

	// Tikai Host pārbaude (Spotify atgriešanās — to sargā vienreizējs nonce, ne sīkdatne).
	hostOnly () {
		return (req, res, next) => (this.hostAllowed(req) ? next() : res.status(403).send("Nepazīstama spoguļa adrese."));
	}

	// /pair maršruti — reģistrē tikai vienreiz, lai cik moduļi to izsauc.
	install (app) {
		if (!app || this.installedOn.has(app)) return;
		this.installedOn.add(app);

		app.get("/pair", this.hostOnly(), (req, res) => {
			const token = this.pair(req.query && req.query.code, req.get("user-agent"));
			res.set("Cache-Control", "no-store");
			if (!token) return res.status(403).sendFile(PAIR_PAGE);
			res.set("Set-Cookie", `${COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE_S}; HttpOnly; SameSite=Lax`);
			const next = NEXT_PAGES.includes(req.query.next) ? req.query.next : "/remote.html";
			return res.redirect(next);
		});
		app.get("/pair/api/state", this.guard(), (req, res) => res.json({ devices: this.deviceCount() }));
		app.post("/pair/api/reset", this.guard(), (req, res) => {
			if (!req.is("application/json")) return res.status(415).json({ error: "Vajag Content-Type: application/json" });
			this.reset();
			return res.json({ devices: 0 });
		});
	}

	// Telefona saite + QR kods spogulim. Spoguļa paša logs (loopback) saņem QR ar
	// pieslēgšanās kodu; citas ierīces, kas atvērušas spoguļa lapu, — tikai adresi.
	async sendPhoneLink (helper, notification, url) {
		const plain = { url, qrSvg: null };
		const namespace = helper.io && helper.io.of(helper.name);
		if (!namespace) {
			helper.sendSocketNotification(notification, plain);
			return;
		}
		const sockets = [...namespace.sockets.values()];
		const mirrors = sockets.filter((s) => isLoopback(s.handshake && s.handshake.address));
		for (const s of sockets) if (!mirrors.includes(s)) s.emit(notification, plain);
		if (!mirrors.length) return;
		let qrSvg = null;
		const qr = loadQrCode();
		if (qr) {
			try {
				// Melns uz balta (nevis inversais) — to nolasa visas telefonu kameras.
				qrSvg = await qr.toString(this.pairUrl(url), { type: "svg", margin: 2 });
			} catch (error) {
				this.log.warn(`phone-auth: neizdevās izveidot QR kodu: ${error.message}`);
			}
		}
		for (const s of mirrors) s.emit(notification, { url, qrSvg });
	}
}

// Viens kopīgs eksemplārs visiem moduļiem (visi node_helper darbojas vienā procesā).
module.exports = new PhoneAuth();
module.exports.PhoneAuth = PhoneAuth;
module.exports.hostnameOf = hostnameOf;
module.exports.isLoopback = isLoopback;
module.exports.COOKIE = COOKIE;
