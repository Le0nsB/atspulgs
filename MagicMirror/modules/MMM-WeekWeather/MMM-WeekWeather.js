/* MagicMirror² Module: MMM-WeekWeather
 *
 * Rāda šīs kalendārās nedēļas laika prognozi — no pirmdienas līdz
 * svētdienai. Dati no Open-Meteo (bezmaksas, bez atslēgas).
 */
Module.register("MMM-WeekWeather", {
	defaults: {
		lat: 57.311886,
		lon: 25.274975,
		updateInterval: 60 * 60 * 1000, // reizi stundā
		initialLoadDelay: 0,
		showPrecipitationProbability: true,
		weekdayLabels: ["Pirmd.", "Otrd.", "Trešd.", "Ceturtd.", "Piektd.", "Sestd.", "Svētd."]
	},

	getStyles () {
		return ["weather-icons.css", "MMM-WeekWeather.css"];
	},

	start () {
		this.weekData = null;
		this.loaded = false;
		this.error = null;
		this.scheduleUpdate(this.config.initialLoadDelay);
	},

	scheduleUpdate (delay) {
		const nextLoad = typeof delay === "number" && delay >= 0 ? delay : this.config.updateInterval;
		setTimeout(() => {
			this.fetchWeather();
			this.scheduleUpdate();
		}, nextLoad);
	},

	// Šīs nedēļas pirmdienas datums (lokālā laikā).
	getMonday () {
		const now = new Date();
		const day = now.getDay(); // 0 = svētdiena
		const diff = (day === 0 ? -6 : 1 - day);
		const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
		return monday;
	},

	ymd (date) {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, "0");
		const d = String(date.getDate()).padStart(2, "0");
		return `${y}-${m}-${d}`;
	},

	async fetchWeather () {
		const monday = this.getMonday();
		const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

		const params = new URLSearchParams({
			latitude: this.config.lat,
			longitude: this.config.lon,
			daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
			timezone: "auto",
			start_date: this.ymd(monday),
			end_date: this.ymd(sunday)
		});
		const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const json = await response.json();
			this.weekData = json.daily;
			this.loaded = true;
			this.error = null;
		} catch (error) {
			Log.error("MMM-WeekWeather: neizdevās ielādēt laika datus", error);
			this.error = error.message || "kļūda";
		}
		this.updateDom(300);
	},

	// WMO laika kods -> weather-icons klase.
	iconFor (code) {
		const map = {
			0: "wi-day-sunny",
			1: "wi-day-sunny-overcast",
			2: "wi-day-cloudy",
			3: "wi-cloudy",
			45: "wi-fog", 48: "wi-fog",
			51: "wi-sprinkle", 53: "wi-sprinkle", 55: "wi-sprinkle",
			56: "wi-sleet", 57: "wi-sleet",
			61: "wi-rain", 63: "wi-rain", 65: "wi-rain",
			66: "wi-rain-mix", 67: "wi-rain-mix",
			71: "wi-snow", 73: "wi-snow", 75: "wi-snow", 77: "wi-snow",
			80: "wi-showers", 81: "wi-showers", 82: "wi-showers",
			85: "wi-snow", 86: "wi-snow",
			95: "wi-thunderstorm", 96: "wi-thunderstorm", 99: "wi-thunderstorm"
		};
		return map[code] || "wi-na";
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-weekweather";

		if (this.error) {
			wrapper.className += " dimmed light small";
			wrapper.innerHTML = `Laika dati nav pieejami (${this.error})`;
			return wrapper;
		}

		if (!this.loaded) {
			wrapper.className += " dimmed light small";
			wrapper.innerHTML = "Ielādē…";
			return wrapper;
		}

		const daily = this.weekData;
		const todayYmd = this.ymd(new Date());

		const row = document.createElement("div");
		row.className = "ww-row";

		daily.time.forEach((iso, i) => {
			const date = new Date(`${iso}T00:00:00`);
			const cell = document.createElement("div");
			cell.className = "ww-day";
			if (iso === todayYmd) cell.className += " ww-today";

			const name = document.createElement("div");
			name.className = "ww-name";
			name.textContent = this.config.weekdayLabels[(date.getDay() + 6) % 7];

			const dm = document.createElement("div");
			dm.className = "ww-date dimmed";
			dm.textContent = `${date.getDate()}.${date.getMonth() + 1}.`;

			const icon = document.createElement("span");
			icon.className = `wi ${this.iconFor(daily.weather_code[i])} ww-icon`;

			const temp = document.createElement("div");
			temp.className = "ww-temp";
			const max = Math.round(daily.temperature_2m_max[i]);
			const min = Math.round(daily.temperature_2m_min[i]);
			temp.innerHTML = `<span class="ww-max">${max}°</span> <span class="ww-min dimmed">${min}°</span>`;

			cell.appendChild(name);
			cell.appendChild(dm);
			cell.appendChild(icon);
			cell.appendChild(temp);

			if (this.config.showPrecipitationProbability) {
				const pop = daily.precipitation_probability_max?.[i];
				if (typeof pop === "number") {
					const p = document.createElement("div");
					p.className = "ww-pop dimmed";
					p.innerHTML = `<span class="wi wi-raindrop"></span> ${pop}%`;
					cell.appendChild(p);
				}
			}

			row.appendChild(cell);
		});

		wrapper.appendChild(row);
		return wrapper;
	}
});
