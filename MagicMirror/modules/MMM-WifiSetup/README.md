# MMM-WifiSetup

Pilnekrāna instrukcijas ekrānā, kamēr Pi ir **comitup** izveidotajā WiFi
hotspot režīmā vai savienojas ar jaunu tīklu — lai bez tastatūras/peles
saprastu, kā spoguli pieslēgt internetam no tālruņa.

Modulis pats parādās un pazūd atkarībā no stāvokļa; parasti nekas
`config` nav jāmaina.

## Kā tas strādā

1. `scripts/comitup/install.sh` uzstāda **comitup** un konfigurē tā
   `external_callback` uz `scripts/comitup/wifi-state-callback.sh`.
2. Comitup izsauc šo skriptu ar `HOTSPOT` / `CONNECTING` / `CONNECTED`
   ikreiz, kad mainās WiFi stāvoklis. Skripts ieraksta stāvokli (un
   `HOTSPOT` gadījumā — pašu apraidīto tīkla nosaukumu un paroli no
   `/etc/comitup.conf`) failā `/run/mm-wifi-state.json`.
3. Šī moduļa `node_helper.js` ik pēc 3 s nolasa šo failu un pārraida
   izmaiņas frontendam.
4. Kamēr stāvoklis ir `HOTSPOT` vai `CONNECTING`, modulis rāda pilnekrāna
   pārklājumu ar tīkla nosaukumu un norādi atvērt `http://10.41.0.1`.
   `HOTSPOT` režīmā rāda arī paroli un **WiFi QR kodu** — noskenē to ar
   tālruņa kameru, un telefons piedāvā pieslēgties bez paroles rakstīšanas.
   `CONNECTED` (vai faila trūkums) — pārklājums paslēpts.

## Hotspot parole

Hotspot vienmēr ir ar paroli: bez tās jebkurš tuvumā varētu pieslēgties un
piekļūt spogulim (tālvadība, izrakstīšanās, kalendārs) bez pieteikšanās.
Parole redzama tikai uz spoguļa ekrāna, tātad pieslēgties var tikai tas, kas
stāv pie spoguļa.

- `sudo scripts/comitup/install.sh` — patur esošo paroli vai uzģenerē jaunu
  (piem. `kp4m-7xqa-2c`) un to izdrukā.
- `sudo scripts/comitup/install.sh <parole>` — sava parole (8–63 simboli).

QR koda bibliotēka (`qrcode`) jau ir MMM-Remote-Control atkarībās; ja tās
nav, ekrānā ir tikai tīkla nosaukums un parole.

Bez comitup uzstādīšanas uz Pi šis modulis vienkārši paliek neredzams.

## Uzstādīšana

```js
{
	module: "MMM-WifiSetup",
	position: "fullscreen_above"   // svarīgi — sedz visu ekrānu
},
```

> **Ar MMM-Pages:** pievieno `"MMM-WifiSetup"` `fixed` sarakstam, citādi
> lapu pārslēgšana to paslēps tieši tad, kad tā vajadzīga.

## Konfigurācija

| Opcija | Noklusējums | Apraksts |
| --- | --- | --- |
| `debug` | `false` | Papildu logi konsolē par katru saņemto stāvokli. |
