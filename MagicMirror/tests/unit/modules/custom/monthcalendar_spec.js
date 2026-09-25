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
		mod.personal = {};
		mod.eventsBySender = {};
		mod.sendersPersonal = {};
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

		it("MMM-GoogleCalendar notikumus liek atsevišķi kā personīgos, ar laiku", () => {
			mod.notificationReceived("CALENDAR_EVENTS", [
				{ title: "Zobārsts", startDate: new Date(2026, 9, 2, 14, 30).getTime(), endDate: new Date(2026, 9, 2, 15, 0).getTime(), fullDayEvent: false },
				{ title: "Atvaļinājums", startDate: new Date(2026, 9, 2).getTime(), endDate: new Date(2026, 9, 4).getTime(), fullDayEvent: true }
			], { identifier: "gcal", name: "MMM-GoogleCalendar" });

			expect(mod.holidaysFor(2026, 9, 2)).toEqual([]);
			const day = mod.personalFor(2026, 9, 2);
			expect(day.map((p) => p.title)).toEqual(["Atvaļinājums", "Zobārsts"]);
			expect(day[0].time).toBe("");
			expect(day[1].time).toMatch(/14.30/);
			// Visas dienas beigu datums ir izslēdzošs: 2.–3. okt., ne 4.
			expect(mod.personalFor(2026, 9, 3).map((p) => p.title)).toEqual(["Atvaļinājums"]);
			expect(mod.personalFor(2026, 9, 4)).toEqual([]);
		});

		it("ignorē, kad showHolidays = false", () => {
			mod.config.showHolidays = false;
			mod.notificationReceived("CALENDAR_EVENTS", [{ title: "X", startDate: String(Date.UTC(2026, 0, 1)), fullDayEvent: true }], { identifier: "c" });
			expect(mod.holidaysFor(2026, 0, 1)).toEqual([]);
		});
	});

	describe("trailingDays", () => {
		it("aizpilda pēdējo nedēļu ar nākamā mēneša dienām", () => {
			// 2026. g. 30. septembris ir trešdiena -> 1.–4. oktobris
			expect(mod.trailingDays(2026, 8, 10)).toBe(4);
		});

		it("mēneša beigās pievieno papildu nedēļu, lai redz minDaysAhead dienas", () => {
			// 29. sept.: šajā mēnesī atlikušas tikai 1 diena, vajag vēl 6 -> 4 + 7
			expect(mod.trailingDays(2026, 8, 29)).toBe(11);
		});
	});
});
