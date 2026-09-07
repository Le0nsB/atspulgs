/* Vienībtesti MMM-MonthCalendar datu apstrādei (vārda dienas + svētki). */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-MonthCalendar/MMM-MonthCalendar.js");

describe("MMM-MonthCalendar data", () => {
	let mod;

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		global.Log = { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		require(MODULE_PATH);

		mod.config = JSON.parse(JSON.stringify(mod.defaults));
		mod.namedays = { "12-25": ["Stella", "Silva", "Sandra"] };
		mod.holidays = {};
		mod.eventsBySender = {};
		mod.updateDom = vi.fn();
	});

	afterEach(() => vi.restoreAllMocks());

	describe("namesFor", () => {
		it("atdod dienas vārdus (mēnesis ir 0-bāzēts)", () => {
			expect(mod.namesFor(11, 25)).toEqual(["Stella", "Silva", "Sandra"]);
		});

		it("atdod tukšu masīvu, ja vārdu nav", () => {
			expect(mod.namesFor(0, 1)).toEqual([]);
		});
	});

	describe("notificationReceived (CALENDAR_EVENTS)", () => {
		it("visas dienas notikumam neieķeksē izslēdzošo beigu datumu", () => {
			mod.notificationReceived("CALENDAR_EVENTS", [
				{
					title: "Ziemassvētki",
					startDate: String(Date.UTC(2026, 11, 25, 0, 0, 0)),
					endDate: String(Date.UTC(2026, 11, 26, 0, 0, 0)),
					fullDayEvent: true
				}
			], { identifier: "calendar_a" });

			expect(mod.holidaysFor(2026, 11, 25)).toContain("Ziemassvētki");
			expect(mod.holidaysFor(2026, 11, 26)).toEqual([]);
		});

		it("apvieno vairākas kalendāra instances un noņem dublikātus", () => {
			const ev = (title) => ({
				title,
				startDate: String(Date.UTC(2026, 5, 23, 0, 0, 0)),
				endDate: String(Date.UTC(2026, 5, 24, 0, 0, 0)),
				fullDayEvent: true
			});
			mod.notificationReceived("CALENDAR_EVENTS", [ev("Līgo")], { identifier: "cal_a" });
			mod.notificationReceived("CALENDAR_EVENTS", [ev("Līgo")], { identifier: "cal_b" });
			expect(mod.holidaysFor(2026, 5, 23)).toEqual(["Līgo"]);
		});

		it("ignorē, kad showHolidays = false", () => {
			mod.config.showHolidays = false;
			mod.notificationReceived("CALENDAR_EVENTS", [{ title: "X", startDate: String(Date.UTC(2026, 0, 1)), fullDayEvent: true }], { identifier: "c" });
			expect(mod.holidaysFor(2026, 0, 1)).toEqual([]);
		});
	});
});
