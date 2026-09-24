/* Vienībtesti MMM-GoogleCalendar (pārlūka puse) notifikāciju apstrādei. */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-GoogleCalendar/MMM-GoogleCalendar.js");

describe("MMM-GoogleCalendar", () => {
	let mod;

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		global.Log = { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		global.document = {
			createElement: (tag) => ({
				tagName: tag,
				className: "",
				innerText: "",
				innerHTML: "",
				children: [],
				appendChild (child) { this.children.push(child); }
			})
		};
		require(MODULE_PATH);
		mod.config = JSON.parse(JSON.stringify(mod.defaults));
		mod.sendSocketNotification = vi.fn();
		mod.sendNotification = vi.fn();
		mod.updateDom = vi.fn();
		mod.events = [];
		mod.hasError = false;
		mod.pairing = null;
		mod.pairingError = null;
	});

	afterEach(() => vi.restoreAllMocks());

	describe("socketNotificationReceived", () => {
		it("GCAL_NO_CLIENT iestata konfigurācijas kļūdu", () => {
			mod.socketNotificationReceived("GCAL_NO_CLIENT");
			expect(mod.hasError).toBe("client");
			expect(mod.updateDom).toHaveBeenCalled();
		});

		it("GCAL_PAIRING_CODE saglabā pairing datus un notīra kļūdas", () => {
			mod.hasError = "kaut kas";
			const payload = { userCode: "ABCD-EFGH", verificationUrl: "https://google.com/device", expiresAt: Date.now() + 1000 };
			mod.socketNotificationReceived("GCAL_PAIRING_CODE", payload);
			expect(mod.pairing).toEqual(payload);
			expect(mod.hasError).toBe(false);
			expect(mod.pairingError).toBeNull();
		});

		it("GCAL_PAIRING_DONE notīra pairing stāvokli", () => {
			mod.pairing = { userCode: "ABCD-EFGH" };
			mod.socketNotificationReceived("GCAL_PAIRING_DONE");
			expect(mod.pairing).toBeNull();
		});

		it("GCAL_PAIRING_ERROR saglabā kļūdu, bet nepārtrauc pairing", () => {
			mod.pairing = { userCode: "ABCD-EFGH" };
			mod.socketNotificationReceived("GCAL_PAIRING_ERROR", "access_denied");
			expect(mod.pairingError).toBe("access_denied");
			expect(mod.pairing).toEqual({ userCode: "ABCD-EFGH" });
		});

		it("GCAL_DATA saglabā notikumus un pārraida CALENDAR_EVENTS", () => {
			const events = [{ title: "Tikšanās", startDate: 1, endDate: 2, fullDayEvent: false }];
			mod.socketNotificationReceived("GCAL_DATA", events);
			expect(mod.hasError).toBe(false);
			expect(mod.events).toEqual(events);
			expect(mod.sendNotification).toHaveBeenCalledWith("CALENDAR_EVENTS", events);
		});

		it("GCAL_ERROR iestata kļūdu, bet nesatur datus", () => {
			mod.events = [{ title: "Vecs", startDate: 1, endDate: 2, fullDayEvent: false }];
			mod.socketNotificationReceived("GCAL_ERROR", "network fail");
			expect(mod.hasError).toBe("network fail");
			expect(mod.events).toHaveLength(1); // vecie dati paliek redzami
		});
	});

	describe("upcoming", () => {
		it("izfiltrē pagājušos notikumus un apgriež pēc maxUpcoming", () => {
			const now = Date.now();
			mod.config.maxUpcoming = 2;
			mod.events = [
				{ title: "Pagājis", startDate: now - 20000, endDate: now - 10000, fullDayEvent: false },
				{ title: "A", startDate: now + 1000, endDate: now + 2000, fullDayEvent: false },
				{ title: "B", startDate: now + 3000, endDate: now + 4000, fullDayEvent: false },
				{ title: "C", startDate: now + 5000, endDate: now + 6000, fullDayEvent: false }
			];
			const result = mod.upcoming();
			expect(result.map((e) => e.title)).toEqual(["A", "B"]);
		});
	});

	describe("getDom", () => {
		it("pairing stāvoklī rāda kodu un adresi, ne notikumu sarakstu", () => {
			mod.pairing = { userCode: "ABCD-EFGH", verificationUrl: "https://google.com/device", expiresAt: Date.now() + 1000 };
			const dom = mod.getDom();
			const pairingBox = dom.children[0];
			expect(pairingBox.className).toBe("gcal-pairing");
			const texts = pairingBox.children.map((c) => c.innerText);
			expect(texts).toContain("ABCD-EFGH");
			expect(texts).toContain("https://google.com/device");
		});
	});
});
