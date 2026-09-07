/* Vienībtesti MMM-WeekWeather palīgfunkcijām. */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-WeekWeather/MMM-WeekWeather.js");

describe("MMM-WeekWeather helpers", () => {
	let mod;

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		global.Log = { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		require(MODULE_PATH);
		mod.config = JSON.parse(JSON.stringify(mod.defaults));
	});

	afterEach(() => vi.restoreAllMocks());

	describe("iconFor", () => {
		it("kartē WMO kodus uz weather-icons klasēm", () => {
			expect(mod.iconFor(0)).toBe("wi-day-sunny");
			expect(mod.iconFor(3)).toBe("wi-cloudy");
			expect(mod.iconFor(65)).toBe("wi-rain");
			expect(mod.iconFor(95)).toBe("wi-thunderstorm");
		});

		it("nezināmam kodam atdod wi-na", () => {
			expect(mod.iconFor(1234)).toBe("wi-na");
			expect(mod.iconFor(undefined)).toBe("wi-na");
		});
	});

	describe("ymd", () => {
		it("formatē datumu kā YYYY-MM-DD ar nullēm", () => {
			expect(mod.ymd(new Date(2026, 0, 5))).toBe("2026-01-05");
			expect(mod.ymd(new Date(2026, 11, 31))).toBe("2026-12-31");
		});
	});

	describe("getMonday", () => {
		it("atdod šīs nedēļas pirmdienu (lokālā laikā)", () => {
			const monday = mod.getMonday();
			expect(monday.getDay()).toBe(1);
			const now = new Date();
			const diffDays = (now - monday) / 86400000;
			expect(diffDays).toBeGreaterThanOrEqual(0);
			expect(diffDays).toBeLessThan(7);
		});
	});
});
