# MMM-SignOut

Izrakstīšanās no spoguļa, lai to varētu pārņemt cits cilvēks. Telefona lapa
`http://<pi-ip>:8080/signout` (poga **Izrakstīties** tālvadībā) parāda, kas
pašlaik ir pieslēgts, un ar atzīmēm ļauj izvēlēties, ko notīrīt:

| Pakalpojums | Kas notiek | API |
|---|---|---|
| Google kalendārs | Tokens tiek atsaukts Google pusē un dzēsts; notikumi pazūd no spoguļa; spogulī parādās jauns pieslēgšanās kods | `POST /calendar/api/signout` |
| Spotify | Konts aizmirsts (Spotify lietotnes Client ID/Secret paliek) | `POST /spotify/api/disconnect` |
| Uzdevumi un iepirkumi | Abi saraksti iztukšoti | `POST /todo/api/reset` |
| Treniņi | Izvēles, treniņi un vēsture dzēsti, līmenis atpakaļ uz 1 | `POST /routines/api/reset` |

Katrs modulis pats notīra savus datus; šis modulis tikai atdod lapu, kas šos
API izsauc pēc kārtas. Moduļi, kas nav `config.js`, lapā netiek rādīti.

Nenotīra: ICS kalendārus (piem. Outlook) no `secrets.js` `calendarFeeds` un
Spotify atslēgas, ja tās ierakstītas `secrets.js` (vecais veids) — tās jāmaina
failā.

## Konfigurācija

```js
{ module: "MMM-SignOut" }
```

Bez `position` — uz ekrāna nekā nav.
