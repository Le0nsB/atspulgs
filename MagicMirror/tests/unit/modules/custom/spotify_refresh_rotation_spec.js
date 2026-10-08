/* Vienībtesti: ja Spotify, atjaunojot access token, iedod JAUNU refresh token,
 * abi Spotify node_helper to saglabā data/spotify.json (un nepārraksta citu
 * telefonā saglabātu lietotni). Failsistēma un fetch ir mockoti. */
const path = require("node:path");
const NodeModule = require("node:module");

const MODULES = path.resolve(__dirname, "../../../../modules");
const NOW_PLAYING = path.join(MODULES, "MMM-SpotifyNowPlaying", "node_helper.js");
const DETAIL = path.join(MODULES, "MMM-SpotifyDetail", "node_helper.js");

/**
 * Ielādē node_helper ar mocktiem `node_helper`/`logger`/`node:fs`.
 * @param {string} file - node_helper.js ceļš.
 * @param {object} [fsMock] - Aizstāj `require("node:fs")`.
 * @returns {object} node_helper definīcija ar reālām metodēm.
 */
function loadHelper (file, fsMock) {
	vi.resetModules();
	delete require.cache[file];
	const originalRequire = NodeModule.prototype.require;
	NodeModule.prototype.require = function (id) {
		if (id === "node_helper") return { create: (def) => def };
		if (id === "logger") return { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		if (id === "node:fs" && fsMock) return fsMock;
		return originalRequire.apply(this, arguments);
	};
	try {
		return require(file);
	} finally {
		NodeModule.prototype.require = originalRequire;
	}
}

const tokenResponse = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const CREDS = { clientId: "a".repeat(32), clientSecret: "b".repeat(32), refreshToken: "old" };

afterEach(() => vi.unstubAllGlobals());

describe("MMM-SpotifyNowPlaying: refresh token rotācija", () => {
	let helper;
	let store;

	beforeEach(() => {
		helper = Object.create(loadHelper(NOW_PLAYING));
		store = { data: { ...CREDS, account: { name: "Leons" } } };
		helper.setup = { read: () => ({ ...store.data }), write: vi.fn((d) => { store.data = d; }) };
		helper.config = { ...CREDS, updateInterval: 15000 };
		helper.accessToken = null;
		helper.accessTokenExpiry = 0;
	});

	it("saglabā jauno refresh token (konta info paliek) un atjauno to atmiņā", async () => {
		vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(tokenResponse({ access_token: "acc", expires_in: 3600, refresh_token: "new" }))));
		await expect(helper.getAccessToken()).resolves.toBe("acc");
		expect(helper.config.refreshToken).toBe("new");
		expect(store.data).toEqual({ ...CREDS, refreshToken: "new", account: { name: "Leons" } });
	});

	it("bez jauna refresh token atbildē neko neraksta", async () => {
		vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(tokenResponse({ access_token: "acc", expires_in: 3600 }))));
		await helper.getAccessToken();
		expect(helper.setup.write).not.toHaveBeenCalled();
		expect(helper.config.refreshToken).toBe("old");
	});

	it("nepārraksta telefonā saglabātu CITU lietotni", async () => {
		store.data = { clientId: "c".repeat(32), clientSecret: "d".repeat(32) };
		vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(tokenResponse({ access_token: "acc", expires_in: 3600, refresh_token: "new" }))));
		await helper.getAccessToken();
		expect(helper.setup.write).not.toHaveBeenCalled();
		expect(helper.config.refreshToken).toBe("new");
	});
});

describe("MMM-SpotifyDetail: refresh token rotācija", () => {
	let helper;
	let files;
	let fsMock;

	beforeEach(() => {
		files = {};
		fsMock = {
			readFileSync: vi.fn((file) => {
				if (!(file in files)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				return files[file];
			}),
			writeFileSync: vi.fn((file, text) => { files[file] = text; }),
			mkdirSync: vi.fn(),
			existsSync: vi.fn(() => false),
			watchFile: vi.fn(),
			unwatchFile: vi.fn()
		};
		helper = Object.create(loadHelper(DETAIL, fsMock));
		helper.config = { ...CREDS, updateInterval: 15000 };
		helper.accessToken = null;
		helper.accessTokenExpiry = 0;
	});

	it("izveido data/spotify.json ar jauno refresh token, ja faila nav (atslēgas no secrets.js)", async () => {
		vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(tokenResponse({ access_token: "acc", expires_in: 3600, refresh_token: "new" }))));
		await helper.getAccessToken();
		const [file, text, opts] = fsMock.writeFileSync.mock.calls[0];
		expect(file.endsWith(path.join("data", "spotify.json"))).toBe(true);
		expect(JSON.parse(text)).toEqual({ ...CREDS, refreshToken: "new" });
		expect(opts).toEqual({ mode: 0o600 });
		expect(helper.config.refreshToken).toBe("new");
	});

	it("nepārraksta telefonā saglabātu CITU lietotni", async () => {
		const file = path.join(MODULES, "..", "data", "spotify.json");
		files[file] = JSON.stringify({ clientId: "c".repeat(32), clientSecret: "d".repeat(32) });
		vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(tokenResponse({ access_token: "acc", expires_in: 3600, refresh_token: "new" }))));
		await helper.getAccessToken();
		expect(fsMock.writeFileSync).not.toHaveBeenCalled();
	});
});
