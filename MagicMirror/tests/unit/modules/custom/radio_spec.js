/* Vienībtesti MMM-Radio: stacijas meklēšana pēc nosaukuma, ICY metadati,
 * servera stāvoklis un balss komandu dedublēšana. */
const path = require("node:path");
const NodeModule = require("node:module");

const HELPER_PATH = path.resolve(__dirname, "../../../../modules/MMM-Radio/node_helper.js");
const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-Radio/MMM-Radio.js");

/**
 * Ielādē node_helper ar mocktiem `node_helper`/`logger`/`node:fs` moduļiem.
 * @returns {object} node_helper definīcija ar reālām metodēm.
 */
function loadHelper () {
	vi.resetModules();
	delete require.cache[HELPER_PATH];
	const originalRequire = NodeModule.prototype.require;
	NodeModule.prototype.require = function (id) {
		if (id === "node_helper") return { create: (def) => def };
		if (id === "logger") return { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		if (id === "node:fs") return { readFileSync: () => { throw new Error("nav"); }, mkdirSync: vi.fn(), writeFileSync: vi.fn() };
		return originalRequire.apply(this, arguments);
	};
	try {
		return require(HELPER_PATH);
	} finally {
		NodeModule.prototype.require = originalRequire;
	}
}

const STATIONS = [
	{ name: "Radio SWH", url: "https://a/swh", aliases: ["swh", "es ve ha"] },
	{ name: "Star FM", url: "https://a/star" },
	{ name: "XO.FM", url: "https://a/xo", aliases: ["ikso"] }
];

describe("MMM-Radio node_helper", () => {
	let helper;

	beforeEach(() => {
		helper = loadHelper();
		helper.start();
		helper.sendSocketNotification = vi.fn();
		helper.scheduleMetadata = vi.fn();
		helper.socketNotificationReceived("RADIO_CONFIG", { stations: STATIONS, showTrack: true });
		helper.sendSocketNotification.mockClear();
	});

	afterEach(() => vi.restoreAllMocks());

	describe("findStation", () => {
		it("atrod pēc nosaukuma, aizstājvārda un ar atstarpju atšķirībām", () => {
			expect(helper.findStation(STATIONS, "star fm")).toBe(1);
			expect(helper.findStation(STATIONS, "starfm")).toBe(1);
			expect(helper.findStation(STATIONS, "es ve ha")).toBe(0);
			expect(helper.findStation(STATIONS, "xo fm")).toBe(2);
			expect(helper.findStation(STATIONS, "ikso")).toBe(2);
		});

		it("atgriež -1 nezināmai stacijai", () => {
			expect(helper.findStation(STATIONS, "latvijas radio")).toBe(-1);
		});
	});

	it("parseStreamTitle sadala izpildītāju un dziesmu", () => {
		expect(helper.parseStreamTitle("StreamTitle='Prāta Vētra - Welcome to My Country';StreamUrl='';"))
			.toEqual({ artist: "Prāta Vētra", title: "Welcome to My Country" });
		expect(helper.parseStreamTitle("StreamTitle='Tiešraide';")).toEqual({ artist: "", title: "Tiešraide" });
		expect(helper.parseStreamTitle("StreamTitle='';")).toBeNull();
	});

	it("fetchIcyTitle nolasa pirmo metadatu bloku", async () => {
		const meta = Buffer.from("StreamTitle='A - B';");
		const block = Buffer.concat([Buffer.from([Math.ceil(meta.length / 16)]), meta, Buffer.alloc(Math.ceil(meta.length / 16) * 16 - meta.length)]);
		const body = Buffer.concat([Buffer.alloc(100), block]);
		let sent = false;
		vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
			ok: true,
			headers: { get: (h) => (h === "icy-metaint" ? "100" : null) },
			body: { getReader: () => ({ read: () => Promise.resolve(sent ? { done: true } : ((sent = true), { done: false, value: body })) }) }
		})));
		expect(await helper.fetchIcyTitle("https://x")).toEqual({ artist: "A", title: "B" });
		vi.unstubAllGlobals();
	});

	it("next/prev iet pa apli un ieslēdz atskaņošanu", () => {
		helper.command("prev");
		expect(helper.state).toMatchObject({ playing: true, index: 2 });
		helper.command("next");
		expect(helper.state.index).toBe(0);
		const state = helper.sendSocketNotification.mock.calls.at(-1);
		expect(state[0]).toBe("RADIO_STATE");
		expect(state[1].station.name).toBe("Radio SWH");
	});

	it("play_named ieslēdz nosaukto staciju vai ziņo, ka tādas nav", () => {
		helper.command("play_named", "star fm");
		expect(helper.state).toMatchObject({ playing: true, index: 1 });
		helper.command("play_named", "kaut kas");
		expect(helper.sendSocketNotification).toHaveBeenCalledWith("RADIO_NOT_FOUND", "kaut kas");
		expect(helper.state.index).toBe(1);
	});

	it("vienu un to pašu komandu no diviem klientiem izpilda vienreiz", () => {
		helper.socketNotificationReceived("RADIO_CMD", { action: "next" });
		helper.socketNotificationReceived("RADIO_CMD", { action: "next" });
		expect(helper.state.index).toBe(1);
	});

	it("failed izslēdz radio tikai pašreizējai stacijai", () => {
		helper.command("play", 1);
		helper.command("failed", 0);
		expect(helper.state.playing).toBe(true);
		helper.command("failed", 1);
		expect(helper.state.playing).toBe(false);
		expect(helper.sendSocketNotification).toHaveBeenCalledWith("RADIO_FAILED", "Star FM");
	});
});

describe("MMM-Radio (pārlūka puse)", () => {
	let mod;

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		global.Log = { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		require(MODULE_PATH);
		mod.config = JSON.parse(JSON.stringify(mod.defaults));
		mod.sendSocketNotification = vi.fn();
		mod.sendNotification = vi.fn();
		mod.updateDom = vi.fn();
		mod.start();
	});

	afterEach(() => vi.restoreAllMocks());

	it("balss/žestu notifikācijas pārsūta serverim", () => {
		mod.notificationReceived("RADIO_TOGGLE");
		mod.notificationReceived("RADIO_PLAY_NAMED", { text: "star fm" });
		expect(mod.sendSocketNotification).toHaveBeenCalledWith("RADIO_CMD", { action: "toggle", value: undefined });
		expect(mod.sendSocketNotification).toHaveBeenCalledWith("RADIO_CMD", { action: "play_named", value: "star fm" });
	});

	it("\"apturi mūziku\" aptur arī radio, ja tas skan", () => {
		mod.state = { playing: true, index: 0, station: { name: "X", url: "u" } };
		mod.notificationReceived("SPOTIFY_PAUSE");
		expect(mod.sendSocketNotification).toHaveBeenCalledWith("RADIO_CMD", { action: "stop", value: undefined });
	});

	it("ne-Electron klients (MacBook) pats neatskaņo", () => {
		expect(mod.isPlayer).toBe(false);
	});
});
