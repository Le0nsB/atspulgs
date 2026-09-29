/* Vienībtesti Spotify pieslēgšanai no telefona (MMM-SpotifyNowPlaying/spotify-setup.js). */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { SpotifySetup, loadFromDataFile, DEFAULT_RELAY } = require(path.resolve(__dirname, "../../../../modules/MMM-SpotifyNowPlaying/spotify-setup.js"));

const ID = "0123456789abcdef0123456789abcdef";
const SECRET = "fedcba9876543210fedcba9876543210";
const response = (status, data) => ({ ok: status < 300, status, json: () => Promise.resolve(data) });

describe("Spotify pieslēgšana (spotify-setup)", () => {
	let dir;
	let file;
	let fetchMock;
	let setup;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "spotify-setup-"));
		file = path.join(dir, "data", "spotify.json");
		fetchMock = vi.fn();
		setup = new SpotifySetup({ dataFile: file, fetchImpl: fetchMock, log: { info () {}, warn () {} } });
	});

	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

	const stateOf = (url) => JSON.parse(Buffer.from(new URL(url).searchParams.get("state"), "base64url").toString());

	it("sākumā nav ne lietotnes, ne pieslēguma; redirect ir starplapa", () => {
		expect(setup.state()).toMatchObject({ hasApp: false, connected: false, redirectUri: DEFAULT_RELAY });
	});

	it("noraida nepareiza formāta Client ID/Secret, neprasot Spotify", async () => {
		await expect(setup.saveApp("abc", SECRET)).rejects.toThrow("Client ID");
		await expect(setup.saveApp(ID, "xyz")).rejects.toThrow("Client Secret");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("saglabā lietotni tikai, ja Spotify to pieņem", async () => {
		fetchMock.mockResolvedValueOnce(response(400, { error: "invalid_client" }));
		await expect(setup.saveApp(ID, SECRET)).rejects.toThrow("nepieņēma");
		expect(fs.existsSync(file)).toBe(false);

		fetchMock.mockResolvedValueOnce(response(200, { access_token: "x" }));
		await setup.saveApp(` ${ID} `, SECRET);
		expect(setup.state()).toMatchObject({ hasApp: true, connected: false, clientId: ID });
		expect((fs.statSync(file).mode & 0o777).toString(8)).toBe("600");
		// Client Secret netiek atdots telefona lapai.
		expect(JSON.stringify(setup.state())).not.toContain(SECRET);
	});

	it("pilna pieslēgšana: login saite -> atgriešanās -> refresh token saglabāts", async () => {
		fetchMock.mockResolvedValueOnce(response(200, {}));
		await setup.saveApp(ID, SECRET);

		const url = setup.loginUrl("http://192.168.1.5:8080");
		const u = new URL(url);
		expect(u.origin + u.pathname).toBe("https://accounts.spotify.com/authorize");
		expect(u.searchParams.get("redirect_uri")).toBe(DEFAULT_RELAY);
		expect(u.searchParams.get("scope")).toContain("user-modify-playback-state");
		expect(stateOf(url).m).toBe("http://192.168.1.5:8080");

		fetchMock
			.mockResolvedValueOnce(response(200, { access_token: "AT", refresh_token: "RT" }))
			.mockResolvedValueOnce(response(200, { display_name: "Leons", product: "premium" }));
		const account = await setup.callback({ code: "C", state: u.searchParams.get("state") });

		expect(account).toEqual({ name: "Leons", product: "premium" });
		const tokenCall = fetchMock.mock.calls[1];
		expect(String(tokenCall[1].body)).toContain("grant_type=authorization_code");
		expect(String(tokenCall[1].body)).toContain(`redirect_uri=${encodeURIComponent(DEFAULT_RELAY)}`);
		expect(loadFromDataFile(file)).toEqual({ clientId: ID, clientSecret: SECRET, refreshToken: "RT" });
		expect(setup.state()).toMatchObject({ connected: true, account: { name: "Leons" } });
	});

	it("atgriešanos bez derīga (vai jau izmantota) state noraida", async () => {
		fetchMock.mockResolvedValue(response(200, { access_token: "AT", refresh_token: "RT" }));
		await setup.saveApp(ID, SECRET);
		const forged = Buffer.from(JSON.stringify({ m: "http://192.168.1.5:8080", n: "viltots" })).toString("base64url");
		await expect(setup.callback({ code: "C", state: forged })).rejects.toThrow("novecojusi");

		const state = new URL(setup.loginUrl("http://pi.local:8080")).searchParams.get("state");
		await setup.callback({ code: "C", state });
		await expect(setup.callback({ code: "C", state })).rejects.toThrow("novecojusi");
	});

	it("atteikums Spotify lapā -> saprotama kļūda", async () => {
		await expect(setup.callback({ error: "access_denied" })).rejects.toThrow("atcelta");
	});

	it("disconnect aizmirst kontu, bet patur lietotni", async () => {
		fetchMock.mockResolvedValue(response(200, {}));
		await setup.saveApp(ID, SECRET);
		setup.write({ ...setup.read(), refreshToken: "RT", account: { name: "X" } });
		setup.disconnect();
		expect(setup.state()).toMatchObject({ hasApp: true, connected: false, account: null });
		expect(loadFromDataFile(file)).toBeNull();
	});
});
