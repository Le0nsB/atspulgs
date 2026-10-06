/* MagicMirror² Module: MMM-EasterEggs
 *
 * Pilnekrāna "pārsteigumi" pa virsu visam spogulim:
 *   EASTEREGG_GLITTER   -> no augšas krīt mirdzoši vizuļi
 *                          (balss: "Spoguli, spoguli, saki man tā")
 *   EASTEREGG_EXPLOSION -> sprādziens pa visu ekrānu
 *                          (žests: vidējais pirksts, MMM-GestureNav)
 *
 * Uz ekrāna modulim pašam nav satura (bez position) — efekti tiek pievienoti
 * tieši document.body ar pointer-events: none, tāpēc neko nebloķē un neietekmē
 * MMM-Pages lapas. explosion.webp ir caurspīdīgs (zaļais fons izgriezts ar
 * tools/make-explosion.py), lai uz spoguļa redzama tikai uguns.
 */
Module.register("MMM-EasterEggs", {
	defaults: {
		glitterMs: 4500, // cik ilgi krīt jauni vizuļi
		glitterFadeMs: 2500, // pēc tam atlikušie vēl krīt un izgaist
		glitterCount: 260, // vizuļu skaits uz ekrāna vienlaikus
		explosionMs: 2030, // viens GIF cikls (29 kadri)
		explosionScale: 1.3 // sprādziena izmērs attiecībā pret ekrānu
	},

	getStyles () {
		return ["MMM-EasterEggs.css"];
	},

	start () {
		this.busy = { glitter: false, explosion: false };
		this.explosionBlob = null;
		// Ielādējam vienreiz; katrai reizei jauns blob: URL, lai animācija sāktos no 1. kadra.
		fetch(this.file("explosion.webp"))
			.then((res) => (res.ok ? res.blob() : null))
			.then((blob) => { this.explosionBlob = blob; })
			.catch((error) => Log.warn("MMM-EasterEggs: neizdevās ielādēt explosion.webp", error));
	},

	notificationReceived (notification) {
		if (notification === "EASTEREGG_GLITTER") this.glitter();
		else if (notification === "EASTEREGG_EXPLOSION") this.explosion();
	},

	overlay (className) {
		const el = document.createElement("div");
		el.className = `easteregg ${className}`;
		document.body.appendChild(el);
		return el;
	},

	/* ------------------------------ vizuļi ------------------------------ */

	glitter () {
		if (this.busy.glitter) return;
		this.busy.glitter = true;

		const layer = this.overlay("easteregg-glitter");
		const canvas = document.createElement("canvas");
		layer.appendChild(canvas);
		const ctx = canvas.getContext("2d");
		const w = canvas.width = window.innerWidth;
		const h = canvas.height = window.innerHeight;

		const colors = ["#fff6c2", "#ffd700", "#f5c542", "#ffffff", "#ffb3e6", "#b3e5ff", "#e0c3ff"];
		const spawn = (startY) => ({
			x: Math.random() * w,
			y: startY,
			vy: 90 + Math.random() * 160, // px/s
			sway: 20 + Math.random() * 40,
			phase: Math.random() * Math.PI * 2,
			size: 2 + Math.random() * 5,
			spin: (Math.random() - 0.5) * 10, // rad/s — plakanais vizulis "apgriežas" un nozibsnī
			angle: Math.random() * Math.PI * 2,
			color: colors[Math.floor(Math.random() * colors.length)],
			star: Math.random() < 0.25
		});
		// Sākumā izkaisīti virs ekrāna, lai nekrīt visi vienā rindā.
		const parts = Array.from({ length: this.config.glitterCount }, () => spawn(-Math.random() * h));

		const started = performance.now();
		let last = started;
		const step = (now) => {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			const elapsed = now - started;
			const spawning = elapsed < this.config.glitterMs;
			// Lēnākie vizuļi citādi kristu vēl ~10 s — beigās visi kopā izgaist.
			const fade = spawning ? 1 : Math.max(0, 1 - (elapsed - this.config.glitterMs) / this.config.glitterFadeMs);
			ctx.clearRect(0, 0, w, h);

			let alive = 0;
			for (let i = 0; i < parts.length; i++) {
				const p = parts[i];
				p.y += p.vy * dt;
				p.angle += p.spin * dt;
				if (p.y > h + 10) {
					if (!spawning) continue;
					parts[i] = spawn(-10);
					continue;
				}
				alive += 1;
				const x = p.x + Math.sin(p.phase + p.y / 60) * p.sway;
				// Apgriešanās: platums = |cos| -> vizulis mirgo kā īsts.
				const flip = Math.abs(Math.cos(p.angle));
				ctx.globalAlpha = (0.35 + 0.65 * flip) * fade;
				ctx.fillStyle = p.color;
				if (p.star) {
					this.drawSparkle(ctx, x, p.y, p.size * (1 + flip), p.color);
				} else {
					ctx.save();
					ctx.translate(x, p.y);
					ctx.rotate(p.angle * 0.3);
					ctx.fillRect(-p.size / 2, -p.size * flip / 2, p.size, Math.max(0.6, p.size * flip));
					ctx.restore();
				}
			}
			ctx.globalAlpha = 1;

			if (fade > 0 && (spawning || alive > 0)) {
				requestAnimationFrame(step);
			} else {
				layer.remove();
				this.busy.glitter = false;
			}
		};
		requestAnimationFrame(step);
	},

	// Četrstūraina zvaigznīte ar mirdzumu.
	drawSparkle (ctx, x, y, r, color) {
		ctx.save();
		ctx.translate(x, y);
		ctx.shadowColor = color;
		ctx.shadowBlur = r * 2;
		ctx.beginPath();
		for (let i = 0; i < 8; i++) {
			const a = i * Math.PI / 4;
			const len = i % 2 === 0 ? r * 1.6 : r * 0.35;
			ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
		}
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	},

	/* ----------------------------- sprādziens ----------------------------- */

	explosion () {
		if (this.busy.explosion) return;
		this.busy.explosion = true;

		const layer = this.overlay("easteregg-explosion");
		layer.style.setProperty("--easteregg-scale", this.config.explosionScale);
		const flash = document.createElement("div");
		flash.className = "easteregg-flash";
		const img = document.createElement("img");
		img.alt = "";
		const url = this.explosionBlob ? URL.createObjectURL(this.explosionBlob) : `${this.file("explosion.webp")}?t=${Date.now()}`;
		img.src = url;
		layer.append(img, flash);

		setTimeout(() => layer.classList.add("easteregg-out"), this.config.explosionMs);
		setTimeout(() => {
			layer.remove();
			if (url.startsWith("blob:")) URL.revokeObjectURL(url);
			this.busy.explosion = false;
		}, this.config.explosionMs + 300);
	}
});
