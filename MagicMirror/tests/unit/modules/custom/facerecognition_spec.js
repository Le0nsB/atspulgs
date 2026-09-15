/* Vienībtesti MMM-FaceRecognition klātbūtnes stāvokļa mašīnai. */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-FaceRecognition/MMM-FaceRecognition.js");

describe("MMM-FaceRecognition presence state machine", () => {
	let mod;

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		global.Log = { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		require(MODULE_PATH);
		mod.config = JSON.parse(JSON.stringify(mod.defaults));
		mod.sendNotification = vi.fn();
		mod.setLabel = vi.fn();
		mod.canvas = null;

		// start() no reālas kameras/worker'a — sagatavojam stāvokli pašrocīgi.
		mod.state = "present";
		mod.faceStreakStart = 0;
		mod.lastFaceSeenAt = 0;
		mod.lastActionAt = -Infinity;
	});

	afterEach(() => vi.restoreAllMocks());

	describe("sākumstāvoklis", () => {
		it("modulis sākas kā \"present\" — nesūta MONITORON uzreiz", () => {
			expect(mod.state).toBe("present");
			expect(mod.sendNotification).not.toHaveBeenCalled();
		});
	});

	describe("prombūtnes noteikšana", () => {
		it("seja nav redzama < absentTimeoutMs -> paliek \"present\", nesūta", () => {
			mod.lastFaceSeenAt = 500;
			mod.handleResult({ present: false, box: null }, 500 + mod.config.absentTimeoutMs - 1);
			expect(mod.state).toBe("present");
			expect(mod.sendNotification).not.toHaveBeenCalled();
		});

		it("seja nav redzama >= absentTimeoutMs -> pāriet uz \"absent\" un sūta MONITOROFF", () => {
			mod.lastFaceSeenAt = 1000;
			mod.handleResult({ present: false, box: null }, 1000 + mod.config.absentTimeoutMs);
			expect(mod.state).toBe("absent");
			expect(mod.sendNotification).toHaveBeenCalledWith("REMOTE_ACTION", { action: "MONITOROFF" });
		});

		it("nekad nav redzēta seja (lastFaceSeenAt=0) -> nesūta MONITOROFF pie starta", () => {
			mod.handleResult({ present: false, box: null }, 999999);
			expect(mod.sendNotification).not.toHaveBeenCalled();
		});
	});

	describe("klātbūtnes noteikšana", () => {
		beforeEach(() => {
			mod.state = "absent";
		});

		it("seja redzama < presentHoldMs -> paliek \"absent\", nesūta", () => {
			mod.handleResult({ present: true, box: null }, 100);
			mod.handleResult({ present: true, box: null }, 100 + mod.config.presentHoldMs - 1);
			expect(mod.state).toBe("absent");
			expect(mod.sendNotification).not.toHaveBeenCalled();
		});

		it("seja redzama nepārtraukti >= presentHoldMs -> pāriet uz \"present\" un sūta MONITORON", () => {
			mod.handleResult({ present: true, box: null }, 100);
			mod.handleResult({ present: true, box: null }, 100 + mod.config.presentHoldMs);
			expect(mod.state).toBe("present");
			expect(mod.sendNotification).toHaveBeenCalledWith("REMOTE_ACTION", { action: "MONITORON" });
		});
	});

	describe("cooldownMs", () => {
		it("bloķē atkārtotu darbību, kamēr nav pagājis cooldownMs", () => {
			mod.config.cooldownMs = 5000;
			mod.state = "absent";
			mod.lastActionAt = -Infinity;

			mod.transition("present", 0);
			expect(mod.sendNotification).toHaveBeenCalledTimes(1);
			expect(mod.state).toBe("present");

			// Mēģina pāriet uz "absent" pirms cooldownMs ir pagājis -> bloķēts.
			mod.transition("absent", 1000);
			expect(mod.sendNotification).toHaveBeenCalledTimes(1);
			expect(mod.state).toBe("present");

			// Pēc cooldownMs pagāšanas darbība beidzot izpildās.
			mod.transition("absent", 6000);
			expect(mod.sendNotification).toHaveBeenCalledTimes(2);
			expect(mod.state).toBe("absent");
		});
	});
});
