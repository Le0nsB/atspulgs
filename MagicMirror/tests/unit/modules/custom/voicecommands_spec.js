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
});
