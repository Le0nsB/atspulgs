/* Vienībtesti MMM-GoogleCalendar node_helper: notikumu normalizācija un
 * OAuth "device authorization" stāvokļu pārejas. */
const path = require("node:path");
const NodeModule = require("node:module");

const HELPER_PATH = path.resolve(__dirname, "../../../../modules/MMM-GoogleCalendar/node_helper.js");
const SECRETS_PATH = path.join(path.resolve(HELPER_PATH, "..", "..", ".."), "secrets.js");

/**
 * Ielādē node_helper ar mocktiem `node_helper`/`logger` (un pēc izvēles
 * `node:fs`/`secrets.js`) moduļiem — nekad neskar reālo failsistēmu.
 * @param {object} [options] - Konfigurācija.
 * @param {object} [options.fsMock] - Aizstāj `require("node:fs")`.
 * @param {object} [options.secretsModule] - Aizstāj `require(<repo>/secrets.js)`.
 * @returns {object} node_helper instance ar reālām metodēm.
 */
function loadHelper ({ fsMock, secretsModule } = {}) {
	vi.resetModules();
	// `vi.resetModules()` neskar Node paša `require.cache` šim jēlajam
	// `require()` ceļam (esam paši uzlikuši `Module.prototype.require`
	// pāri) — bez šīs rindas node_helper.js pēc pirmā ielādes reizes paliktu
	// kešots ar REĀLU `fs`/secrets.js, un turpmākie fsMock/secretsModule
	// argumenti klusi netiktu ņemti vērā.
	delete require.cache[HELPER_PATH];
	const originalRequire = NodeModule.prototype.require;
	NodeModule.prototype.require = function (id) {
		if (id === "node_helper") return { create: (def) => def };
		if (id === "logger") return { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		if (id === "node:fs" && fsMock) return fsMock;
		if (id === SECRETS_PATH && secretsModule) return secretsModule;
		return originalRequire.apply(this, arguments);
	};
	try {
		return require(HELPER_PATH);
	} finally {
		NodeModule.prototype.require = originalRequire;
	}
}

describe("MMM-GoogleCalendar node_helper", () => {
	let helper;

	beforeEach(() => {
		helper = loadHelper();
		helper.sendSocketNotification = vi.fn();
		helper.saveToken = vi.fn();
		helper.scheduleNext = vi.fn();
		helper.schedulePairingPoll = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	describe("socketNotificationReceived", () => {
		const secretsModule = { google: { oauthClientId: "client-id", oauthClientSecret: "client-secret" } };

		it("GCAL_CONFIG saglabā payload kā this.config (regresijtests: agrāk šis trūka)", () => {
			const fsMock = {
				existsSync: vi.fn(() => true),
				readFileSync: vi.fn(() => { throw new Error("nav token.json"); })
			};
			helper = loadHelper({ fsMock, secretsModule });
			helper.sendSocketNotification = vi.fn();
			helper.beginPairing = vi.fn();

			const payload = { updateInterval: 60000, maximumNumberOfDays: 30 };
			helper.socketNotificationReceived("GCAL_CONFIG", payload);

			expect(helper.config).toEqual(payload);
			expect(helper.beginPairing).toHaveBeenCalled();
		});

		it("ja token.json jau satur refresh token, uzreiz sāk poll() ar iestatītu config", () => {
			const fsMock = {
				existsSync: vi.fn(() => true),
				readFileSync: vi.fn(() => JSON.stringify({ refreshToken: "RT" }))
			};
			helper = loadHelper({ fsMock, secretsModule });
			helper.sendSocketNotification = vi.fn();
			helper.poll = vi.fn();

			const payload = { updateInterval: 60000, maximumNumberOfDays: 30 };
			helper.socketNotificationReceived("GCAL_CONFIG", payload);

			expect(helper.config).toEqual(payload);
			expect(helper.refreshToken).toBe("RT");
			expect(helper.poll).toHaveBeenCalled();
		});

		it("bez OAuth klienta (secrets.js tukšs) nosūta GCAL_NO_CLIENT un neiestata config", () => {
			const fsMock = { existsSync: vi.fn(() => false), readFileSync: vi.fn() };
			helper = loadHelper({ fsMock, secretsModule: { google: {} } });
			helper.start(); // reāli šis vienmēr izpildās pirms socketNotificationReceived (iestata this.config = null)
			helper.sendSocketNotification = vi.fn();

			helper.socketNotificationReceived("GCAL_CONFIG", { updateInterval: 60000, maximumNumberOfDays: 30 });

			expect(helper.sendSocketNotification).toHaveBeenCalledWith("GCAL_NO_CLIENT");
			expect(helper.config).toBeNull();
		});
	});

	describe("normalize", () => {
		it("laika notikumam patur precīzu laiku", () => {
			const item = {
				summary: "Tikšanās",
				start: { dateTime: "2026-03-05T10:00:00+02:00" },
				end: { dateTime: "2026-03-05T11:00:00+02:00" }
			};
			const out = helper.normalize(item);
			expect(out.title).toBe("Tikšanās");
			expect(out.fullDayEvent).toBe(false);
			expect(out.endDate).toBeGreaterThan(out.startDate);
		});

		it("visas dienas notikumam iestata fullDayEvent", () => {
			const item = { summary: "Dzimšanas diena", start: { date: "2026-03-05" }, end: { date: "2026-03-06" } };
			const out = helper.normalize(item);
			expect(out.fullDayEvent).toBe(true);
		});

		it("bez beigu laika izmanto sākuma laiku", () => {
			const item = { summary: "Atgādinājums", start: { dateTime: "2026-03-05T10:00:00Z" } };
			const out = helper.normalize(item);
			expect(out.endDate).toBe(out.startDate);
		});

		it("bez sākuma laika atgriež null", () => {
			expect(helper.normalize({ summary: "Bojāts" })).toBeNull();
		});
	});

	describe("beginPairing", () => {
		it("saglabā pairing stāvokli un nosūta kodu", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
				ok: true,
				json: () => ({
					device_code: "dc123",
					user_code: "ABCD-EFGH",
					verification_url: "https://google.com/device",
					expires_in: 1800,
					interval: 5
				})
			}));
			helper.clientId = "client-id";

			await helper.beginPairing();

			expect(helper.pairing).toBeTruthy();
			expect(helper.pairing.deviceCode).toBe("dc123");
			expect(helper.sendSocketNotification).toHaveBeenCalledWith("GCAL_PAIRING_CODE", expect.objectContaining({
				userCode: "ABCD-EFGH",
				verificationUrl: "https://google.com/device"
			}));
		});

		it("kļūdas gadījumā nosūta GCAL_PAIRING_ERROR", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: () => "bad request" }));
			helper.clientId = "client-id";

			await helper.beginPairing();

			expect(helper.pairing).toBeNull();
			expect(helper.sendSocketNotification).toHaveBeenCalledWith("GCAL_PAIRING_ERROR", expect.any(String));
		});
	});

	describe("pollPairing", () => {
		beforeEach(() => {
			helper.clientId = "client-id";
			helper.clientSecret = "client-secret";
			helper.config = { updateInterval: 60000, maximumNumberOfDays: 30 };
			helper.pairing = { deviceCode: "dc123", interval: 5000, expiresAt: Date.now() + 100000, timer: null };
		});

		it("authorization_pending -> paliek pairing stāvoklī, plāno nākamo poll", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
				ok: false,
				json: () => ({ error: "authorization_pending" })
			}));

			await helper.pollPairing();

			expect(helper.pairing).toBeTruthy();
			expect(helper.schedulePairingPoll).toHaveBeenCalled();
			expect(helper.sendSocketNotification).not.toHaveBeenCalledWith("GCAL_PAIRING_DONE");
		});

		it("veiksmīgs apstiprinājums -> saglabā token, nosūta GCAL_PAIRING_DONE, sāk poll()", async () => {
			helper.poll = vi.fn();
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
				ok: true,
				json: () => ({ access_token: "AT", refresh_token: "RT", expires_in: 3600 })
			}));

			await helper.pollPairing();

			expect(helper.refreshToken).toBe("RT");
			expect(helper.saveToken).toHaveBeenCalled();
			expect(helper.pairing).toBeNull();
			expect(helper.sendSocketNotification).toHaveBeenCalledWith("GCAL_PAIRING_DONE");
			expect(helper.poll).toHaveBeenCalled();
		});

		it("access_denied -> notīra pairing un nosūta kļūdu", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
				ok: false,
				json: () => ({ error: "access_denied" })
			}));

			await helper.pollPairing();

			expect(helper.pairing).toBeNull();
			expect(helper.sendSocketNotification).toHaveBeenCalledWith("GCAL_PAIRING_ERROR", "access_denied");
		});

		it("ja pairing logs beidzies -> sāk jaunu pairing", async () => {
			helper.pairing.expiresAt = Date.now() - 1000;
			helper.beginPairing = vi.fn();

			await helper.pollPairing();

			expect(helper.pairing).toBeNull();
			expect(helper.beginPairing).toHaveBeenCalled();
		});
	});
});
