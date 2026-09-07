/* Vienībtesti MMM-DailyVerse teksta izvēlei. */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-DailyVerse/MMM-DailyVerse.js");

describe("MMM-DailyVerse pickIndex", () => {
	let mod;

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		require(MODULE_PATH);
		mod.config = JSON.parse(JSON.stringify(mod.defaults));
	});

	afterEach(() => vi.restoreAllMocks());

	it("'daily' režīmā ir deterministisks un diapazonā", () => {
		mod.config.mode = "daily";
		mod.config.items = ["a", "b", "c", "d"];
		const first = mod.pickIndex();
		expect(first).toBe(mod.pickIndex());
		expect(first).toBeGreaterThanOrEqual(0);
		expect(first).toBeLessThan(4);
	});

	it("'daily' režīmā seko dienas kārtas numuram gadā", () => {
		mod.config.mode = "daily";
		mod.config.items = ["a", "b", "c", "d", "e"];
		const now = new Date();
		const startOfYear = new Date(now.getFullYear(), 0, 0);
		const dayOfYear = Math.floor((now - startOfYear) / 86400000);
		expect(mod.pickIndex()).toBe(dayOfYear % 5);
	});

	it("'random' režīmā paliek diapazonā", () => {
		mod.config.mode = "random";
		mod.config.items = ["a", "b", "c"];
		for (let i = 0; i < 50; i++) {
			const idx = mod.pickIndex();
			expect(idx).toBeGreaterThanOrEqual(0);
			expect(idx).toBeLessThan(3);
		}
	});

	it("tukšam sarakstam atdod -1", () => {
		mod.config.items = [];
		expect(mod.pickIndex()).toBe(-1);
	});
});
