# Boodschappen-ophaler (Leek)

Haalt elke ochtend de aanbiedingen en gewone prijzen op van de supermarkten in Leek, en een kleine app
(`app/`) laat zien waar je boodschappen in de aanbieding zijn en waar ze normaal het goedkoopst zijn.

Alleen voor **privégebruik**: één verzoek per winkel per dag, met een eerlijke User-Agent.
Publiceer of verkoop de gegevens niet door.

## Status per winkel

| Winkel | Status | Bron |
|---|---|---|
| Jumbo | ✅ | `jumbo.com/aanbiedingen/nu` (deze week + vanaf woensdag volgende week) |
| Aldi | ✅ | `aldi.nl/aanbiedingen.html` (ma/wo/vr/za-acties) |
| Poiesz | ✅ | `webwinkel.poiesz-supermarkten.nl/aanbiedingen` |
| Lidl | ✅ (deels) | `lidl.nl/c/aanbiedingen`: alleen de eerste ~50 producten; de rest laadt Lidl pas na "Toon meer" |
| Albert Heijn | ✅ | ah.nl blokkeert automatische verzoeken → de Bonusfolder-PDF van `folder.ah.nl` wordt uitgelezen (gratis, zie onder) |

## Gebruik

Vereist Node.js 20 of nieuwer.

```bash
npm install
npm run ophalen                         # live ophalen (aanbiedingen + gewone prijzen)
npm run app                             # de app bekijken op http://localhost:8123/app/
node src/run.js --offline <map>         # opgeslagen pagina's <map>/<winkel>.html gebruiken (AH wordt dan overgeslagen)
npm test
```

## Formaat

Elke aanbieding in `data/aanbiedingen.json`:

```json
{
  "winkel": "aldi",
  "id": "1219324",
  "titel": "Avocado's",
  "merk": null,
  "omschrijving": "700 g",
  "actie": "-14%",
  "actieprijs": 2.39,
  "aantal": 1,
  "normaalprijs": 2.79,
  "alleen": null,
  "geldig_van": "2026-11-09",
  "geldig_tot": "2026-11-15",
  "categorie": "Aardappelen, groenten en fruit",
  "url": "https://www.aldi.nl/product/...",
  "afbeelding": "https://..."
}
```

- `actie`: de tekst van het etiket ("2 voor 2,99", "1+1 gratis", "25% korting", "OP=OP").
- `actieprijs` + `aantal`: bij "2 voor 2,99" → `2.99` en `2`. Leeg als de actie geen vaste prijs heeft (bv. "25% korting" op een hele groep).
- `alleen`: `"online"`, `"winkel"`, `"slijterij"` als de actie niet overal geldt. Voor je ouders vallen `"online"`-acties af.
- `geldig_tot` is de **laatste** dag dat de actie geldt.

`data/archief/<datum>.json` bewaart elke dag een compacte kopie (120 dagen) voor prijsgeschiedenis.

## Gewone prijzen

`data/prijzen.json` komt uit de open dataset van [Checkjebon](https://github.com/supermarkt/checkjebon)
(dagelijks bijgewerkt). We bewaren alleen AH, Jumbo, Lidl en Poiesz, en alleen producten met een bekende
verpakkingsmaat, zodat je per kilo/liter/stuk kunt vergelijken. Formaat: `producten: [[winkel, naam, prijs, maat], ...]`.

- **Aldi zit er niet in** (Checkjebon heeft Aldi niet); van Aldi tonen we alleen de aanbiedingen.
- Het zijn webwinkelprijzen; in de winkel kan het soms iets schelen.
- Mislukt het ophalen, dan blijft het bestand van de vorige keer staan.

## De app

Een gewone webpagina die je op de telefoon "op het beginscherm" zet (werkt op iPhone én Android,
geen app store nodig). Je typt wat je wilt halen ("melk, eieren, kaas"), en per boodschap zie je:

1. **In de aanbieding**: alle acties die vandaag gelden, met een link naar de winkel of de folderpagina;
2. **Gewone prijs, goedkoopste eerst**: per winkel het goedkoopste passende product, per kilo/liter/stuk;
3. bovenaan (bij 2+ boodschappen) welke winkel het best past bij wat je nog moet halen.

Tijdens het typen komen er suggesties ("curry" → currysaus, currypasta), en bij een typefout vraagt de app
"Bedoelde je …?". In de winkel kun je boodschappen afvinken.

De lijst blijft op de telefoon bewaard. Zonder internet laat de app de prijzen van de laatste keer zien.

Het zoeken (`app/zoeken.js`) is slim maar niet perfect: "melk" vindt geen chocolademelk en "kaas" geen
pindakaas, maar soms komt er een vreemde eend tussen. Daarom staat bij elke prijs de productnaam.

| Bestand | Wat |
|---|---|
| `app/index.html`, `app.js`, `style.css` | de app |
| `app/zoeken.js` | zoeken en vergelijken (ook getest in `test/zoeken.test.js`) |
| `app/suggesties.js` | suggesties tijdens het typen ("curry" → currysaus) en typefouten ("bedoelde je kipfilet?"), uit de woorden van alle productnamen |
| `app/sw.js`, `manifest.webmanifest` | installeren en offline werken |
| `app/icoon*.png`, `icoon.svg` | iconen, gemaakt met `npm run iconen` |

**Op de telefoon zetten** (als de app online staat):
- iPhone: open de link in **Safari** → deelknop (vierkantje met pijl) → **Zet op beginscherm**.
- Android: open de link in **Chrome** → menu (drie puntjes) → **App installeren** of **Toevoegen aan startscherm**.

## Albert Heijn: de Bonusfolder uitlezen

AH staat geen automatische verzoeken toe op ah.nl, maar publiceert de Bonusfolder als PDF op
`folder.ah.nl/bonus-week-<week>-<jaar>/`. In die PDF staat de tekst met positie en lettergrootte.
`src/winkels/ah.js`:

1. zoekt de folder van deze week (en vanaf vrijdagmiddag ook die van volgende week);
2. leest per pagina de **productnamen** (kleine letters) en de **etiketten** (grote letters:
   "25% korting", "1+1 gratis", "2 stuks 2.99");
3. koppelt elke naam aan het dichtstbijzijnde etiket;
4. bewaart het resultaat in `data/cache/ah-<folder>.json`, zodat de PDF (~23 MB) maar één keer per week
   wordt gedownload.

Gratis en zonder AI, maar **niet perfect**: bij een ongewone opmaak kan een etiket bij het verkeerde
product terechtkomen. Daarom linkt elke AH-aanbieding (`url`) naar de juiste folderpagina. In week 46
kwamen er 104 aanbiedingen uit, steekproeven klopten allemaal.

- Deals uit de AH Voordeelshop (koptelefoons, skipassen) krijgen `alleen: "online"`.
- Prijsfavorieten (blijvend verlaagd) krijgen de actie `"nieuwe lage prijs"`.
- Bij "De actieprijzen variëren van 2.38-7.48" staat dat bereik in `omschrijving`.

Ziet een AH-week er vreemd uit? Verwijder het bestand in `data/cache/` en draai opnieuw. Verandert AH de
opmaak van de folder echt, verhoog dan `VERSIE` in `ah.js` nadat je de parser hebt aangepast.

## Automatisch draaien

`.github/workflows/aanbiedingen.yml` draait elke ochtend op GitHub Actions (gratis):

1. **ophalen**: haalt de aanbiedingen en prijzen op en commit `data/`;
2. **publiceren**: zet `app/`, `data/` (zonder `cache/`) en `index.html` op GitHub Pages.

Pas je alleen de app aan (`app/**`, `index.html`) en push je naar `main`, dan wordt er alleen opnieuw
gepubliceerd. Met **Actions → Run workflow** start je alles met de hand.

Eenmalig instellen in de (openbare) repository: **Settings → Pages → Source: GitHub Actions**.
De app staat dan op `https://<gebruikersnaam>.github.io/<repo>/app/`.
Alles is gratis: er zijn geen betaalde diensten of sleutels nodig.
Mislukt een winkel, dan gaan de andere gewoon door en verschijnt er een waarschuwing in de run.

## Als een winkel stuk gaat

Winkels passen hun website soms aan. De parser geeft dan een duidelijke fout
("pagina-opbouw veranderd?"). Sla de pagina op als `<winkel>.html`, draai met `--offline` en pas
`src/winkels/<winkel>.js` aan.
