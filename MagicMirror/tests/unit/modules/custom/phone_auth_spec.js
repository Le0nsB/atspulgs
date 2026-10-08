/* Vienībtesti lib/phone-auth.js: telefonu pieslēgšana ar QR kodu, ierīces
 * sīkdatnes pārbaude telefona API un Host galvenes pārbaude. Stāvokļa fails
 * — pagaidu mapē (ne īstajā data/). */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { PhoneAuth, hostnameOf, isLoopback, COOKIE } = require(path.resolve(__dirname, "../../../../lib/phone-auth.js"));

const HOSTS = new Set(["localhost", "127.0.0.1", "::1", "192.168.1.5", "spogulis", "spogulis.local"]);
const PHONE_IP = "192.168.1.20";

/**
 * Viltots Express pieprasījums.
 * @param {object} [options] - Pieprasījuma dati.
 * @param {string} [options.host] - Host galvene.
 * @param {string} [options.ip] - Klienta IP adrese.
 * @param {string} [options.cookie] - Cookie galvene.
 * @param {object} [options.query] - URL parametri.
 * @param {boolean} [options.json] - Vai Content-Type ir application/json.
 * @returns {object} req
 */
function request ({ host = "192.168.1.5:8080", ip = PHONE_IP, cookie, query = {}, json = true } = {}) {
	return {
		headers: { host, ...(cookie ? { cookie } : {}) },
		socket: { remoteAddress: ip },
		query,
		get: (name) => (name === "user-agent" ? "TestPhone" : undefined),
		is: (type) => json && type === "application/json"
	};
}

/**
 * Viltota Express atbilde, kas pieraksta, kas ar to notika.
 * @returns {object} res
 */
function response () {
	const res = { statusCode: 200, headers: {}, body: undefined, file: null, redirectedTo: null };
	const record = (fn) => (...args) => {
		fn(...args);
		return res;
	};
	res.status = record((code) => { res.statusCode = code; });
	res.json = record((data) => { res.body = data; });
	res.send = record((data) => { res.body = data; });
	res.set = record((name, value) => { res.headers[name] = value; });
	res.sendFile = record((file) => { res.file = file; });
	res.redirect = record((url) => { res.redirectedTo = url; });
	return res;
}

describe("lib/phone-auth", () => {
	let dir;
	let file;
	let auth;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "phone-auth-"));
		file = path.join(dir, "data", "phone-auth.json");
		auth = new PhoneAuth({ file, hostnames: () => HOSTS, log: { error: vi.fn(), warn: vi.fn() } });
	});

	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

	const pairedCookie = () => `${COOKIE}=${auth.pair(auth.state().pairCode)}`;

	describe("palīgfunkcijas", () => {
		it("hostnameOf noņem portu, kvadrātiekavas un punktu beigās", () => {
			expect(hostnameOf("192.168.1.5:8080")).toBe("192.168.1.5");
			expect(hostnameOf("[::1]:8080")).toBe("::1");
			expect(hostnameOf("Spogulis.local.")).toBe("spogulis.local");
			expect(hostnameOf("")).toBe("");
		});

		it("isLoopback atpazīst tikai paša Pi adreses", () => {
			for (const a of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) expect(isLoopback(a)).toBe(true);
			for (const a of ["192.168.1.20", "::ffff:10.0.0.2", "", undefined]) expect(isLoopback(a)).toBe(false);
		});
	});

	describe("pieslēgšana", () => {
		it("stāvokļa fails tiek izveidots tikai īpašniekam lasāms", () => {
			auth.state();
			expect(fs.statSync(file).mode & 0o777).toBe(0o600);
		});

		it("nepareizs kods neiedod atslēgu", () => {
			auth.state();
			expect(auth.pair("nepareizs")).toBeNull();
			expect(auth.pair("")).toBeNull();
			expect(auth.pair(undefined)).toBeNull();
			expect(auth.deviceCount()).toBe(0);
		});

		it("pareizs kods iedod atslēgu; serverī glabājas tikai tās jaucējvērtība", () => {
			const token = auth.pair(auth.state().pairCode, "TestPhone");
			expect(token).toMatch(/^[\w-]{40,}$/);
			const saved = fs.readFileSync(file, "utf8");
			expect(saved).not.toContain(token);
			expect(auth.deviceCount()).toBe(1);
		});

		it("pieslēgts telefons un pats Pi ir uzticami, svešs telefons — nē", () => {
			expect(auth.isTrusted(request({ cookie: pairedCookie() }))).toBe(true);
			expect(auth.isTrusted(request({ ip: "127.0.0.1" }))).toBe(true);
			expect(auth.isTrusted(request())).toBe(false);
			expect(auth.isTrusted(request({ cookie: `${COOKIE}=izdomāts` }))).toBe(false);
		});

		it("reset aizmirst visus telefonus, nomaina kodu un paziņo moduļiem", () => {
			const cookie = pairedCookie();
			const oldCode = auth.state().pairCode;
			const onReset = vi.fn();
			auth.on("reset", onReset);
			auth.reset();
			expect(onReset).toHaveBeenCalledTimes(1);
			expect(auth.isTrusted(request({ cookie }))).toBe(false);
			expect(auth.pair(oldCode)).toBeNull();
			expect(auth.deviceCount()).toBe(0);
		});

		it("stāvoklis saglabājas pēc restarta (jauns eksemplārs, tas pats fails)", () => {
			const cookie = pairedCookie();
			const again = new PhoneAuth({ file, hostnames: () => HOSTS });
			expect(again.isTrusted(request({ cookie }))).toBe(true);
		});

		it("pairUrl ved caur /pair uz to pašu lapu", () => {
			const url = new URL(auth.pairUrl("http://192.168.1.5:8080/todo"));
			expect(url.origin).toBe("http://192.168.1.5:8080");
			expect(url.pathname).toBe("/pair");
			expect(url.searchParams.get("code")).toBe(auth.state().pairCode);
			expect(url.searchParams.get("next")).toBe("/todo");
		});
	});

	describe("Express starpprogrammas", () => {
		it("guard: sveša Host galvene -> 403 (arī pieslēgtam telefonam)", () => {
			const res = response();
			const next = vi.fn();
			auth.guard()(request({ host: "evil.example:8080", cookie: pairedCookie() }), res, next);
			expect(res.statusCode).toBe(403);
			expect(next).not.toHaveBeenCalled();
		});

		it("guard: nepieslēgts telefons -> 401 ar paskaidrojumu", () => {
			const res = response();
			const next = vi.fn();
			auth.guard()(request(), res, next);
			expect(res.statusCode).toBe(401);
			expect(res.body).toEqual(expect.objectContaining({ pair: true }));
			expect(next).not.toHaveBeenCalled();
		});

		it("guard: pieslēgts telefons un pats Pi tiek cauri", () => {
			const next = vi.fn();
			auth.guard()(request({ host: "spogulis.local:8080", cookie: pairedCookie() }), response(), next);
			auth.guard()(request({ host: "localhost:8080", ip: "::1" }), response(), next);
			expect(next).toHaveBeenCalledTimes(2);
		});

		it("page: nepieslēgtam telefonam rāda pieslēgšanās lapu, pieslēgtam — īsto", () => {
			const handler = auth.page("/tmp/lapa.html");
			const denied = response();
			handler(request(), denied);
			expect(denied.statusCode).toBe(401);
			expect(denied.file).toMatch(/pair-needed\.html$/);
			const allowed = response();
			handler(request({ cookie: pairedCookie() }), allowed);
			expect(allowed.file).toBe("/tmp/lapa.html");
		});
	});

	describe("/pair maršruti", () => {
		let routes;

		beforeEach(() => {
			routes = {};
			const register = (method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; };
			auth.install({ get: register("GET"), post: register("POST") });
		});

		const run = (key, req) => {
			const res = response();
			const handlers = routes[key];
			let i = 0;
			const next = () => handlers[++i](req, res, next);
			handlers[0](req, res, next);
			return res;
		};

		it("install reģistrē maršrutus tikai vienreiz", () => {
			const app = { get: vi.fn(), post: vi.fn() };
			auth.install(app);
			auth.install(app);
			expect(app.get).toHaveBeenCalledTimes(2);
			expect(app.post).toHaveBeenCalledTimes(1);
		});

		it("pareizs kods: HttpOnly + SameSite sīkdatne un pāradresācija uz lapu", () => {
			const res = run("GET /pair", request({ query: { code: auth.state().pairCode, next: "/todo" } }));
			expect(res.redirectedTo).toBe("/todo");
			expect(res.headers["Set-Cookie"]).toMatch(new RegExp(`^${COOKIE}=[\\w-]+; Path=/; Max-Age=\\d+; HttpOnly; SameSite=Lax$`));
			const cookie = res.headers["Set-Cookie"].split(";")[0];
			expect(auth.isTrusted(request({ cookie }))).toBe(true);
		});

		it("nepazīstams next -> /remote.html (nav atvērtas pāradresācijas)", () => {
			for (const next of ["https://evil.example", "//evil.example", "/config/config.js", undefined]) {
				const res = run("GET /pair", request({ query: { code: auth.state().pairCode, next } }));
				expect(res.redirectedTo).toBe("/remote.html");
			}
		});

		it("nepareizs kods -> 403 un pieslēgšanās lapa, bez sīkdatnes", () => {
			const res = run("GET /pair", request({ query: { code: "nepareizs", next: "/todo" } }));
			expect(res.statusCode).toBe(403);
			expect(res.headers["Set-Cookie"]).toBeUndefined();
			expect(res.file).toMatch(/pair-needed\.html$/);
		});

		it("/pair ar svešu Host galveni -> 403", () => {
			const res = run("GET /pair", request({ host: "evil.example", query: { code: auth.state().pairCode } }));
			expect(res.statusCode).toBe(403);
			expect(auth.deviceCount()).toBe(0);
		});

		it("/pair/api/reset prasa pieslēgtu telefonu un JSON", () => {
			expect(run("POST /pair/api/reset", request()).statusCode).toBe(401);
			const cookie = pairedCookie();
			expect(run("POST /pair/api/reset", request({ cookie, json: false })).statusCode).toBe(415);
			expect(run("POST /pair/api/reset", request({ cookie })).body).toEqual({ devices: 0 });
			expect(auth.isTrusted(request({ cookie }))).toBe(false);
		});
	});

	describe("sendPhoneLink", () => {
		const socket = (address) => ({ handshake: { address }, emit: vi.fn() });

		it("kodu (QR) saņem tikai spoguļa paša logs, citas ierīces — tikai adresi", async () => {
			const mirror = socket("::ffff:127.0.0.1");
			const laptop = socket("::ffff:192.168.1.30");
			const helper = { name: "MMM-TodoList", io: { of: () => ({ sockets: new Map([["a", mirror], ["b", laptop]]) }) } };

			await auth.sendPhoneLink(helper, "TODOLIST_PHONE_LINK", "http://192.168.1.5:8080/todo");

			expect(laptop.emit).toHaveBeenCalledWith("TODOLIST_PHONE_LINK", { url: "http://192.168.1.5:8080/todo", qrSvg: null });
			const [, payload] = mirror.emit.mock.calls[0];
			expect(payload.url).toBe("http://192.168.1.5:8080/todo");
			expect(payload.qrSvg).toContain("<svg"); // qrcode ir MMM-Remote-Control atkarībās
			expect(JSON.stringify(laptop.emit.mock.calls)).not.toContain(auth.state().pairCode);
		});

		it("bez socket.io (piem. testos) sūta tikai adresi", async () => {
			const helper = { sendSocketNotification: vi.fn() };
			await auth.sendPhoneLink(helper, "GCAL_PHONE_LINK", "http://192.168.1.5:8080/calendar");
			expect(helper.sendSocketNotification).toHaveBeenCalledWith("GCAL_PHONE_LINK", { url: "http://192.168.1.5:8080/calendar", qrSvg: null });
		});
	});
});
