# MMM-WeekWeather

Šīs kalendārās nedēļas (pirmdiena–svētdiena) laika prognoze vienā rindā, un zem
tās — **šodienas prognoze pa stundām** (no pašreizējās stundas uz priekšu).

Dati no [Open-Meteo](https://open-meteo.com/) — bezmaksas, bez API atslēgas.

## Kā tas darbojas

- Katru `updateInterval` modulis pieprasa Open-Meteo `daily` (un pēc izvēles
  `hourly`) datus par nedēļu ar `timezone=auto`.
- Pieprasījumam ir 15 s noildze; ja tā iestājas, statuss rāda „noildze".
- Ikonas: WMO laika kodi tiek kartēti uz [weather-icons](https://erikflowers.github.io/weather-icons/)
  klasēm (`weather-icons.css` tiek ielādēts automātiski).

## Konfigurācija

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `lat` | `57.311886` | Platums |
| `lon` | `25.274975` | Garums |
| `updateInterval` | `3600000` | Cik bieži (ms) atsvaidzināt (noklusējums — reizi stundā) |
| `initialLoadDelay` | `0` | Aizture (ms) pirms pirmās ielādes |
| `showPrecipitationProbability` | `true` | Rādīt nokrišņu varbūtību (%) |
| `showHourly` | `true` | Rādīt šodienas prognozi pa stundām |
| `hourlyLabel` | `"Šodien pa stundām"` | Virsraksts stundu rindai |
| `weekdayLabels` | `["Pirmd.", …, "Svētd."]` | Nedēļas dienu saīsinājumi (pirmdien–svētdien) |

## Piemērs

```js
{
    module: "MMM-WeekWeather",
    position: "middle_center",
    header: "Nedēļas laikapstākļi",
    config: {
        lat: 57.311886,
        lon: 25.274975
    }
}
```
