/* Vienībtesti MMM-CalendarAgenda notikumu grupēšanai pa dienām. */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-CalendarAgenda/MMM-CalendarAgenda.js");

describe("MMM-CalendarAgenda", () => {
	let mod;
	const GCAL = { identifier: "gcal", name: "MMM-GoogleCalendar" };
	const now = new Date(2026, 8, 25, 12, 0); // piektdiena, 25. sept. 12:00
	const at = (d, h, m = 0) => new Date(2026, 8, d, h, m).getTime();

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		global.Log = { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		require(MODULE_PATH);
		mod.config = JSON.parse(JSON.stringify(mod.defaults));
		mod.updateDom = vi.fn();
		mod.events = null;
	});

	afterEach(() => vi.restoreAllMocks());

	describe("notificationReceived", () => {
		it("pieņem CALENDAR_EVENTS tikai no MMM-GoogleCalendar", () => {
			mod.notificationReceived("CALENDAR_EVENTS", [{ title: "Svētki" }], { identifier: "c", name: "calendar" });
			expect(mod.events).toBeNull();
			mod.notificationReceived("CALENDAR_EVENTS", [{ title: "Tikšanās" }], GCAL);
			expect(mod.events).toEqual([{ title: "Tikšanās" }]);
		});
	});

	describe("groupByDay", () => {
		it("rāda nākamo dienu notikumus, sagrupētus un sakārtotus", () => {
			mod.events = [
				{ title: "Pagājis", startDate: at(25, 8), endDate: at(25, 9), fullDayEvent: false },
				{ title: "Notiek", startDate: at(25, 11), endDate: at(25, 13), fullDayEvent: false },
				{ title: "Zobārsts", startDate: at(28, 14, 30), endDate: at(28, 15), fullDayEvent: false },
				{ title: "Dzimšanas diena", startDate: at(28, 0), endDate: at(29, 0), fullDayEvent: true },
				{ title: "Pārāk tālu", startDate: at(25, 10) + 20 * 86400000, endDate: at(25, 11) + 20 * 86400000, fullDayEvent: false }
			];
			const days = mod.groupByDay(now);
			expect(days.map((d) => d.offset)).toEqual([0, 3]);
			expect(days[0].events.map((e) => e.title)).toEqual(["Notiek"]);
			expect(days[1].events.map((e) => e.title)).toEqual(["Dzimšanas diena", "Zobārsts"]);
		});

		it("vairāku dienu notikums parādās katrā dienā, bet ne pēc izslēdzošā beigu datuma", () => {
			mod.events = [{ title: "Atvaļinājums", startDate: at(26, 0), endDate: at(28, 0), fullDayEvent: true }];
			expect(mod.groupByDay(now).map((d) => d.offset)).toEqual([1, 2]);
		});

		it("ievēro maxEntries", () => {
			mod.config.maxEntries = 2;
			mod.events = [26, 27, 28].map((d) => ({ title: `E${d}`, startDate: at(d, 10), endDate: at(d, 11), fullDayEvent: false }));
			const days = mod.groupByDay(now);
			expect(days.flatMap((d) => d.events.map((e) => e.title))).toEqual(["E26", "E27"]);
		});
	});

	describe("dayLabel / timeLabel", () => {
		it("šodien, rīt un tālākas dienas", () => {
			expect(mod.dayLabel(new Date(2026, 8, 25), 0).main).toBe("Šodien");
			expect(mod.dayLabel(new Date(2026, 8, 26), 1).main).toBe("Rīt");
			expect(mod.dayLabel(new Date(2026, 8, 28), 3)).toEqual({ main: "Pirmdiena, 28. septembris", sub: "pēc 3 d." });
		});

		it("notiekošs notikums ir 'Tagad'", () => {
			const e = { startDate: at(25, 11), endDate: at(25, 13), fullDayEvent: false };
			expect(mod.timeLabel(e, new Date(2026, 8, 25), now)).toEqual({ text: "Tagad", now: true });
		});
	});
});
