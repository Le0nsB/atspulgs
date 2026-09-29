/* Vienībtesti MMM-VoiceCommands frāžu sakritības loģikai. */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-VoiceCommands/MMM-VoiceCommands.js");

describe("MMM-VoiceCommands matching", () => {
	let mod;

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		global.Log = { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		global.window = { location: { search: "" } }; // nav Web Speech API -> loma "display"

		require(MODULE_PATH);

		mod.config = JSON.parse(JSON.stringify(mod.defaults));
		mod.name = "MMM-VoiceCommands";
		mod.updateDom = vi.fn();
		mod.sendNotification = vi.fn();
		mod.sendSocketNotification = vi.fn();
		mod.start(); // sagatavo activationNorm / commandsNorm
	});

	afterEach(() => {
		delete global.window;
		vi.restoreAllMocks();
	});

	describe("normalize", () => {
		it("noņem diakritiku, pieturzīmes un lieko atstarpi", () => {
			expect(mod.normalize("  Spoguli, PARĀDI  laikApstākļus! ")).toBe("spoguli paradi laikapstaklus");
		});
	});

	describe("levenshtein", () => {
		it("rēķina rediģēšanas attālumu", () => {
			expect(mod.levenshtein("kaka", "kaka")).toBe(0);
			expect(mod.levenshtein("spoguli", "spoguuli")).toBe(1);
			expect(mod.levenshtein("", "abc")).toBe(3);
		});
	});

	describe("matchActivation", () => {
		it("atpazīst aktivācijas vārdu un atdod atlikumu", () => {
			const r = mod.matchActivation(["spoguli", "paradi", "zinas"]);
			expect(r.matched).toBe(true);
			expect(r.rest).toBe("paradi zinas");
		});

		it("pieļauj vienas burta kļūdu (fuzzy)", () => {
			const r = mod.matchActivation(["spoguuli"]);
			expect(r.matched).toBe(true);
		});

		it("neatpazīst nesaistītu tekstu", () => {
			expect(mod.matchActivation(["labdien", "cik", "pulkstenis"]).matched).toBe(false);
		});
	});

	describe("matchCommand", () => {
		it("precīza frāze uzvar", () => {
			const cmd = mod.matchCommand(mod.normalize("parādi laikapstākļus"));
			expect(cmd.notification).toBe("PAGES_GOTO");
			expect(cmd.payload).toBe(0);
		});

		it("garāka frāze pārspēj īsāku (nākamā ziņa vs ziņas)", () => {
			const cmd = mod.matchCommand(mod.normalize("nākamā ziņa"));
			expect(cmd.notification).toBe("NEWSDETAIL_NEXT");
		});

		it("īss atslēgvārds joprojām atrod komandu", () => {
			const cmd = mod.matchCommand(mod.normalize("kalendārs"));
			expect(cmd.payload).toBe(2);
		});

		it("atdod null, ja nekas nesakrīt", () => {
			expect(mod.matchCommand(mod.normalize("uzvāri man kafiju"))).toBeNull();
		});

		it("tukšam tekstam atdod null", () => {
			expect(mod.matchCommand("")).toBeNull();
		});
	});

	describe("capture komandas (brīvs teksts)", () => {
		it("\"nopirku pienu\" -> TODO_COMPLETE ar tekstu", () => {
			const found = mod.findCommand(mod.normalize("nopirku pienu"), "nopirku pienu");
			expect(found.cmd.notification).toBe("TODO_COMPLETE");
			expect(found.cmd.payload).toEqual({ list: "shopping" });
			expect(found.rest).toBe("pienu");
		});

		it("saglabā garumzīmes tekstā", () => {
			const text = "Spoguli, pievieno iepirkumiem ābolus!";
			mod.process([text]);
			expect(mod.sendSocketNotification).toHaveBeenCalledWith("VC_COMMAND", expect.objectContaining({
				notification: "TODO_ADD",
				payload: { list: "shopping", text: "ābolus" }
			}));
		});

		it("bez teksta pēc frāzes capture komanda neder", () => {
			expect(mod.findCommand(mod.normalize("nopirku"), "nopirku")).toBeNull();
		});

		it("garāka precīza frāze pārspēj capture (\"nopirku pirkumu\")", () => {
			expect(mod.matchCommand(mod.normalize("nopirku pirkumu")).payload).toEqual({ list: "shopping" });
			expect(mod.matchCommand(mod.normalize("nopirku pirkumu")).capture).toBeUndefined();
		});

		it("treniņa frāze netiek uztverta kā uzdevums", () => {
			expect(mod.matchCommand(mod.normalize("izdarīju treniņu")).notification).toBe("ROUTINES_COMPLETE");
			expect(mod.matchCommand(mod.normalize("pabeidzu treniņu")).notification).toBe("ROUTINES_COMPLETE");
		});

		it("starprezultātā capture gaida teikuma beigas", () => {
			vi.useFakeTimers();
			mod.activate();
			mod.sendSocketNotification.mockClear();
			mod.process(["nopirku pi"], { final: false });
			mod.process(["nopirku pienu"], { final: false });
			expect(mod.sendSocketNotification).not.toHaveBeenCalledWith("VC_COMMAND", expect.anything());
			vi.advanceTimersByTime(mod.config.captureDelay + 10);
			expect(mod.sendSocketNotification).toHaveBeenCalledWith("VC_COMMAND", expect.objectContaining({ payload: { list: "shopping", text: "pienu" } }));
			vi.useRealTimers();
		});
	});

	describe("rītdienas laikapstākļi un also", () => {
		it("\"laikapstākļi rīt\" pāriet uz lapu un izceļ rītdienu", () => {
			const cmd = mod.matchCommand(mod.normalize("laikapstākļi rīt"));
			expect(cmd.notification).toBe("PAGES_GOTO");
			expect(cmd.also).toEqual([{ notification: "WEEKWEATHER_SHOW_DAY", payload: 1 }]);
		});

		it("remoteCommand izpilda arī also notifikācijas", () => {
			mod.remoteCommand({ id: "x1", notification: "PAGES_GOTO", payload: 0, also: [{ notification: "WEEKWEATHER_SHOW_DAY", payload: 1 }] });
			expect(mod.sendNotification).toHaveBeenCalledWith("PAGES_GOTO", 0);
			expect(mod.sendNotification).toHaveBeenCalledWith("WEEKWEATHER_SHOW_DAY", 1);
		});
	});

	describe("loma server (Pi mikrofons + whisper.cpp)", () => {
		beforeEach(() => {
			mod.config.listen = "server";
			mod.role = mod.resolveRole();
		});

		it("config listen: \"server\" dod lomu server", () => {
			expect(mod.role).toBe("server");
		});

		it("ALL_MODULES_STARTED palūdz node_helper palaist mikrofonu ar uzvedni", () => {
			mod.notificationReceived("ALL_MODULES_STARTED");
			const call = mod.sendSocketNotification.mock.calls.find(([n]) => n === "VC_SERVER_START");
			expect(call[1]).toMatchObject({ language: "lv", model: expect.stringContaining("ggml") });
			expect(call[1].prompt).toContain("Spoguli, parādi laikapstākļus.");
			expect(call[1].prompt.length).toBeLessThanOrEqual(600);
		});

		it("VC_TRANSCRIPT tiek apstrādāts kā dzirdēts teksts", () => {
			mod.socketNotificationReceived("VC_TRANSCRIPT", { text: "Spoguli, parādi ziņas." });
			expect(mod.sendSocketNotification).toHaveBeenCalledWith("VC_COMMAND", expect.objectContaining({ notification: "PAGES_GOTO", payload: 3 }));
		});

		it("display loma VC_TRANSCRIPT ignorē (lai neizpilda divreiz)", () => {
			mod.role = "display";
			mod.socketNotificationReceived("VC_TRANSCRIPT", { text: "Spoguli, parādi ziņas." });
			expect(mod.sendSocketNotification).not.toHaveBeenCalledWith("VC_COMMAND", expect.anything());
		});
	});
});
