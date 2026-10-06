/* Vienībtesti MMM-WifiSetup: WiFi QR koda teksts un QR izveide hotspot režīmā. */
const path = require("node:path");
const NodeModule = require("node:module");

const HELPER_PATH = path.resolve(__dirname, "../../../../modules/MMM-WifiSetup/node_helper.js");

/**
 * Ielādē node_helper ar mocktiem `node_helper`/`logger` moduļiem.
 * @returns {object} node_helper definīcija ar reālām metodēm.
 */
function loadHelper () {
	vi.resetModules();
	delete require.cache[HELPER_PATH];
	const originalRequire = NodeModule.prototype.require;
	NodeModule.prototype.require = function (id) {
		if (id === "node_helper") return { create: (def) => def };
		if (id === "logger") return { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		return originalRequire.apply(this, arguments);
	};
	try {
		return require(HELPER_PATH);
	} finally {
		NodeModule.prototype.require = originalRequire;
	}
}

describe("MMM-WifiSetup node_helper", () => {
	let helper;

	beforeEach(() => {
		helper = loadHelper();
	});

	describe("wifiQrText", () => {
		it("WPA tīkls ar paroli", () => {
			expect(helper.wifiQrText("MagicMirror-4f2", "kp4m-7xqa-2c")).toBe("WIFI:T:WPA;S:MagicMirror-4f2;P:kp4m-7xqa-2c;;");
		});

		it("bez paroles — atvērts tīkls", () => {
			expect(helper.wifiQrText("MagicMirror-4f2", "")).toBe("WIFI:T:nopass;S:MagicMirror-4f2;;");
		});

		it("aizsargā speciālās rakstzīmes", () => {
			expect(helper.wifiQrText("a;b", "p:w,\"x\\y")).toBe("WIFI:T:WPA;S:a\\;b;P:p\\:w\\,\\\"x\\\\y;;");
		});
	});

	describe("qrFor", () => {
		it("HOTSPOT ar nosaukumu -> SVG ar QR kodu", async () => {
			const toString = vi.fn().mockResolvedValue("<svg/>");
			const svg = await helper.qrFor.call({ qr: { toString } }, { state: "HOTSPOT", ssid: "MM-1", password: "kp4m-7xqa-2c" });
			expect(svg).toBe("<svg/>");
			expect(toString).toHaveBeenCalledWith("WIFI:T:WPA;S:MM-1;P:kp4m-7xqa-2c;;", expect.objectContaining({ type: "svg" }));
		});

		it("citos stāvokļos vai bez nosaukuma QR nav", async () => {
			const toString = vi.fn();
			const ctx = { qr: { toString } };
			expect(await helper.qrFor.call(ctx, { state: "CONNECTING", ssid: "MM-1", password: "x" })).toBeNull();
			expect(await helper.qrFor.call(ctx, { state: "HOTSPOT", ssid: "", password: "x" })).toBeNull();
			expect(toString).not.toHaveBeenCalled();
		});

		it("bez qrcode bibliotēkas QR nav", async () => {
			expect(await helper.qrFor.call({ qr: null }, { state: "HOTSPOT", ssid: "MM-1", password: "x" })).toBeNull();
		});
	});
});
