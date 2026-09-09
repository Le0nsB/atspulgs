/* Vienībtesti MMM-GestureNav pirkstu ģeometrijai un žestu kartējumam. */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-GestureNav/MMM-GestureNav.js");

// 21 punkti (MediaPipe Hand). Noklusējumā visi sakrīt; testi uzstāda konkrētus pirkstus.
const blankHand = () => Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));

// Iztaisno pirkstu (mcp..tip vienā līnijā, vienādi soļi) vai saloka (maza horda).
const setFinger = (lm, [mcp, pip, dip, tip], extended) => {
	if (extended) {
		lm[mcp] = { x: 0, y: 0 };
		lm[pip] = { x: 0, y: 0.1 };
		lm[dip] = { x: 0, y: 0.2 };
		lm[tip] = { x: 0, y: 0.3 };
	} else {
		lm[mcp] = { x: 0, y: 0 };
		lm[pip] = { x: 0, y: 0.1 };
		lm[dip] = { x: 0, y: 0.05 };
		lm[tip] = { x: 0.01, y: 0 }; // virsotne atpakaļ pie pamata -> maza horda
	}
};

const FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];

// Roka ar `extendedCount` iztaisnotiem pirkstiem (no rādītāja).
const handWith = (extendedCount) => {
	const lm = blankHand();
	FINGERS.forEach((f, i) => setFinger(lm, f, i < extendedCount));
	return lm;
};

describe("MMM-GestureNav gestures", () => {
	let mod;

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		global.Log = { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		require(MODULE_PATH);
		mod.config = JSON.parse(JSON.stringify(mod.defaults));
	});

	afterEach(() => vi.restoreAllMocks());

	describe("extendedFingerCount", () => {
		it("saskaita iztaisnotus pirkstus", () => {
			expect(mod.extendedFingerCount(handWith(0))).toBe(0);
			expect(mod.extendedFingerCount(handWith(2))).toBe(2);
			expect(mod.extendedFingerCount(handWith(4))).toBe(4);
		});
	});

	describe("fingerBucket", () => {
		it("0..3 pirksti -> tas pats skaitlis", () => {
			expect(mod.fingerBucket(handWith(1))).toBe(1);
			expect(mod.fingerBucket(handWith(3))).toBe(3);
		});

		it(">= palmMinFingers -> 5 (plauksta)", () => {
			expect(mod.fingerBucket(handWith(4))).toBe(5);
		});
	});

	describe("gestureFor", () => {
		it("kartē baketu uz konfigurēto notifikāciju", () => {
			mod.config.oneFinger = "PAGES_GOTO";
			mod.config.oneFingerPayload = 0;
			expect(mod.gestureFor(1)).toEqual({ notification: "PAGES_GOTO", payload: 0 });
		});

		it("null konfigurācija -> nav darbības", () => {
			mod.config.threeFingers = null;
			expect(mod.gestureFor(3)).toBeNull();
		});

		it("nezināms bakets -> null", () => {
			expect(mod.gestureFor(9)).toBeNull();
		});
	});

	describe("handEngaged", () => {
		// Roka ar plaukstas locītavu (0) un plaukstas pamatu (9) konkrētās y vietās.
		const handAt = (wristY, palmBaseY) => {
			const lm = blankHand();
			lm[0] = { x: 0.5, y: wristY };
			lm[9] = { x: 0.5, y: palmBaseY };
			return lm;
		};

		it("pacelta roka ar pirkstiem uz augšu -> aktīva", () => {
			expect(mod.handEngaged(handAt(0.3, 0.1))).toBe(true);
		});

		it("nolaista roka (locītava zem activeZoneBottom) -> nav aktīva", () => {
			expect(mod.handEngaged(handAt(0.8, 0.6))).toBe(false);
		});

		it("roka zonā, bet pirksti uz leju -> nav aktīva", () => {
			expect(mod.handEngaged(handAt(0.3, 0.4))).toBe(false);
		});

		it("activeZoneEnabled: false -> zona netiek pārbaudīta", () => {
			mod.config.activeZoneEnabled = false;
			expect(mod.handEngaged(handAt(0.9, 0.6))).toBe(true);
		});

		it("requireUprightHand: false -> orientācija netiek pārbaudīta", () => {
			mod.config.requireUprightHand = false;
			expect(mod.handEngaged(handAt(0.3, 0.4))).toBe(true);
		});
	});

	describe("bucketLabel", () => {
		it("cilvēkam lasāmi nosaukumi", () => {
			expect(mod.bucketLabel(0)).toBe("dūre");
			expect(mod.bucketLabel(1)).toBe("1 pirksts");
			expect(mod.bucketLabel(2)).toBe("2 pirksti");
			expect(mod.bucketLabel(5)).toBe("✋ plauksta");
			expect(mod.bucketLabel(-1)).toBe("…");
		});
	});
});
