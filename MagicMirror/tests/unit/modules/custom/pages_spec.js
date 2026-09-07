/* Vienībtesti MMM-Pages lapu pārslēgšanas loģikai. */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-Pages/MMM-Pages.js");

describe("MMM-Pages navigation", () => {
	let mod;

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		global.Log = { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		require(MODULE_PATH);

		mod.config = { ...mod.defaults, pages: [["a"], ["b"], ["c"]], home: 0 };
		mod.curPage = 0;
		mod.domReady = false; // updatePages() klusi neko nedara
		mod.identifier = "module_test";
		mod.sendNotification = vi.fn();
	});

	afterEach(() => vi.restoreAllMocks());

	describe("changePage", () => {
		it("iet uz priekšu", () => {
			mod.changePage(1);
			expect(mod.curPage).toBe(1);
		});

		it("apļo no pēdējās uz pirmo, kad wrap = true", () => {
			mod.curPage = 2;
			mod.changePage(1);
			expect(mod.curPage).toBe(0);
		});

		it("piespiež pie robežas, kad wrap = false", () => {
			mod.config.wrap = false;
			mod.curPage = 2;
			mod.changePage(1);
			expect(mod.curPage).toBe(2);
			mod.curPage = 0;
			mod.changePage(-1);
			expect(mod.curPage).toBe(0);
		});

		it("raida PAGE_CHANGED tikai pie faktiskas maiņas", () => {
			mod.config.wrap = false;
			mod.curPage = 0;
			mod.changePage(-1); // paliek 0
			expect(mod.sendNotification).not.toHaveBeenCalled();
			mod.changePage(1); // -> 1
			expect(mod.sendNotification).toHaveBeenCalledWith("PAGE_CHANGED", 1);
		});
	});

	describe("goToPage", () => {
		it("pieņem derīgu indeksu", () => {
			mod.goToPage(2);
			expect(mod.curPage).toBe(2);
		});

		it("ignorē ārpusdiapazona un nederīgu indeksu", () => {
			mod.goToPage(5);
			expect(mod.curPage).toBe(0);
			mod.goToPage(-1);
			expect(mod.curPage).toBe(0);
			mod.goToPage("abc");
			expect(mod.curPage).toBe(0);
		});
	});
});
