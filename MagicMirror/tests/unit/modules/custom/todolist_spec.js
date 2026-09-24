/* Vienībtesti MMM-TodoList notifikāciju pārsūtīšanai un saraksta uzbūvei. */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-TodoList/MMM-TodoList.js");

describe("MMM-TodoList", () => {
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
		mod.tasks = [];
		mod.shopping = [];
		mod.hasError = false;
	});

	afterEach(() => vi.restoreAllMocks());

	describe("TODO_COMPLETE pārsūtīšana", () => {
		it("pārsūta uz node_helper ar to pašu sarakstu", () => {
			mod.notificationReceived("TODO_COMPLETE", { list: "shopping" });
			expect(mod.sendSocketNotification).toHaveBeenCalledWith("TODOLIST_COMPLETE", { list: "shopping" });
		});

		it("ignorē, ja payload nav saraksta nosaukuma", () => {
			mod.notificationReceived("TODO_COMPLETE", {});
			expect(mod.sendSocketNotification).not.toHaveBeenCalled();
		});

		it("ignorē citas notifikācijas", () => {
			mod.notificationReceived("SOME_OTHER", { list: "tasks" });
			expect(mod.sendSocketNotification).not.toHaveBeenCalled();
		});
	});

	describe("socketNotificationReceived", () => {
		it("TODOLIST_NO_CREDENTIALS iestata konfigurācijas kļūdu", () => {
			mod.updateDom = vi.fn();
			mod.socketNotificationReceived("TODOLIST_NO_CREDENTIALS");
			expect(mod.hasError).toBe("config");
			expect(mod.updateDom).toHaveBeenCalled();
		});

		it("TODOLIST_DATA aizpilda sarakstus un notīra kļūdu", () => {
			mod.updateDom = vi.fn();
			mod.hasError = "kaut kas";
			mod.socketNotificationReceived("TODOLIST_DATA", {
				tasks: [{ id: "1", content: "Nopirkt pienu" }],
				shopping: [{ id: "2", content: "Maize" }]
			});
			expect(mod.hasError).toBe(false);
			expect(mod.tasks).toEqual([{ id: "1", content: "Nopirkt pienu" }]);
			expect(mod.shopping).toEqual([{ id: "2", content: "Maize" }]);
		});
	});

	describe("buildColumn", () => {
		it("tukšam sarakstam parāda \"Nekā nav\"", () => {
			const col = mod.buildColumn("Uzdevumi", [], "fa-list-check");
			const list = col.children[1];
			expect(list.children).toHaveLength(1);
			expect(list.children[0].className).toBe("td-empty");
		});

		it("apgriež pēc maxItems un parāda atlikušo skaitu", () => {
			mod.config.maxItems = 2;
			const items = [
				{ id: "1", content: "A" },
				{ id: "2", content: "B" },
				{ id: "3", content: "C" }
			];
			const col = mod.buildColumn("Uzdevumi", items, "fa-list-check");
			const list = col.children[1];
			expect(list.children).toHaveLength(3); // 2 ieraksti + "+1 vēl"
			expect(list.children[2].className).toBe("td-more");
			expect(list.children[2].innerText).toBe("+1 vēl");
		});
	});
});
