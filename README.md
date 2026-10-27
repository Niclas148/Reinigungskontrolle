# Reinigungskontrolle – Grundschulen und Kitas der Kreisstadt Merzig

Hausmeister prüfen morgens, ob ihre Einrichtungen geputzt und sauber sind, und melden Mängel (optional mit Bemerkung). Die Leitung sieht alle Einträge, erstellt Auswertungen als PDF und Excel und kann sie per Mail weitergeben.

## Aufbau

Alle Dateien liegen im Hauptverzeichnis des Repos.

| Datei | Zweck |
|---|---|
| `index.html`, `style.css` | Oberfläche |
| `app.js` | Anmeldung, Hausmeister-Ansicht, Tagesübersicht, Einrichtungen, Benutzer |
| `auswertung.js` | Auswertung und Diagramme (nur Leitung) |
| `export.js` | PDF- und Excel-Export, Mailversand |
| `kalender.js` | Kalenderwochen, Feiertage, **Schulferien Saarland (jährlich pflegen!)** |
| `hilfen.js` | Gemeinsame Funktionen, Liste der Mangel-Bereiche |
| `datastore.js` | **Einzige Datei mit Firebase-Bezug** (wichtig für den Umzug) |
| `firebase-config.js` | Zugangsdaten des Firebase-Projekts |
| `firestore.rules` | Zugriffsregeln der Datenbank |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Installation als App auf dem Handy |
| `logo.png` (optional) | Stadtlogo im Kopf; fehlt die Datei, wird nichts angezeigt |

## Demo

`demo.html` zeigt die komplette Seite mit erfundenen Daten (14 Einrichtungen, rund 2,5 Monate Kontrollen, Mängel, Nachträge). Kein Login, kein Firebase; oben in der gelben Leiste zwischen Hausmeister- und Leitungs-Ansicht wechseln. Aufruf: `https://niclas148.github.io/<Repo>/demo.html`

## Pflege

- **Schulferien:** In `kalender.js` die Liste `FERIEN_SAARLAND` jedes Jahr mit dem Bildungsserver Saarland abgleichen und ergänzen. Feiertage werden automatisch berechnet.
- **Mangel-Bereiche:** In `hilfen.js` unter `BEREICHE` anpassbar, getrennt für Grundschulen und Kitas.
- **Logo:** Datei `logo.png` (ca. 120 px hoch) ins Repo legen.
- **Nach jedem Update:** In `sw.js` die Versionsnummer bei `CACHE` hochzählen, damit installierte Apps die neue Version laden.

## Einrichtung (einmalig)

### 1. Firebase-Projekt
1. In der [Firebase Console](https://console.firebase.google.com) ein neues Projekt anlegen (z. B. `reinigung-merzig`). Google Analytics wird nicht gebraucht.
2. **Authentication** → Jetzt starten → Anbieter **E-Mail/Passwort** aktivieren.
3. **Firestore Database** → Datenbank erstellen → Standort `europe-west3 (Frankfurt)` → Produktionsmodus.
4. **Firestore → Regeln**: Inhalt von `firestore.rules` einfügen und veröffentlichen.
5. **Projekteinstellungen → Allgemein → Meine Apps → Web-App hinzufügen**. Die angezeigte `firebaseConfig` in `js/firebase-config.js` eintragen.

### 2. Ersten Leitungs-Zugang anlegen
1. **Authentication → Nutzer → Nutzer hinzufügen**
   E-Mail: `admin@reinigung-merzig.local` (Benutzername `admin`), Passwort frei wählen.
2. Die angezeigte **Nutzer-UID** kopieren.
3. **Firestore → Sammlung starten** → Sammlungs-ID `benutzer` → Dokument-ID = die UID → Felder:

   | Feld | Typ | Wert |
   |---|---|---|
   | `name` | string | z. B. `Niclas Mertes` |
   | `benutzername` | string | `admin` |
   | `rolle` | string | `leitung` |
   | `aktiv` | boolean | `true` |
   | `einrichtungen` | array | (leer) |

Alle weiteren Benutzer (Hausmeister und Leitung) werden danach direkt in der Seite unter **Benutzer** angelegt.

### 3. GitHub Pages
1. Neues Repository anlegen (z. B. `Reinigungskontrolle`) und alle Dateien hochladen.
2. **Settings → Pages** → Branch `main`, Ordner `/ (root)`.
3. In Firebase unter **Authentication → Einstellungen → Autorisierte Domains** `niclas148.github.io` hinzufügen.

### 4. Einrichtungen eintragen
Als `admin` anmelden → **Einrichtungen** → „Mehrere auf einmal hinzufügen“ und die 6 Grundschulen und 8 städtischen Kitas im Format `Art;Name;Adresse` einfügen.

## Bedienung

**Hausmeister:** Anmelden → für jede Einrichtung „Alles sauber“ oder „Mangel melden“ (Art und Bereich ankreuzen, Bemerkung freiwillig). Ein Eintrag pro Einrichtung und Tag. Nach dem Speichern ist der Eintrag gesperrt; Ergänzungen und nachträglich entdeckte Mängel gehen nur als Nachtrag. Löschen kann nur die Leitung.

**Als App installieren:** Android/Chrome: Menü → „App installieren“ bzw. Button „Als App installieren“ oben. iPhone/Safari: Teilen → „Zum Home-Bildschirm“.

**Leitung:**
- *Tagesübersicht*: Stand eines Tages mit Blättern vor/zurück; Einträge können im Notfall gelöscht werden.
- *Auswertung*: Zeitraum, Kalenderwoche oder Schnellauswahl → Kennzahlen, Diagramme, Übersicht je Einrichtung und je KW → PDF, Excel oder „Per Mail senden“. Am Handy und in Edge/Chrome unter Windows öffnet sich der Teilen-Dialog mit beiden Dateien im Anhang; sonst werden die Dateien heruntergeladen und das Mailprogramm geöffnet.
- *Einrichtungen*, *Benutzer*: Pflege. Einrichtungen und Konten werden deaktiviert statt gelöscht, damit die Historie erhalten bleibt.
- *Datensicherung*: kompletter Export als JSON.

„Ohne Eintrag“ zählt nur Arbeitstage: ohne Wochenenden und saarländische Feiertage, bei Grundschulen zusätzlich ohne Schulferien. Einträge an Wochenenden erscheinen trotzdem in der Auswertung.

## Späterer Umzug (z. B. auf einen eigenen Server im Stadtnetz)

1. **Daten sichern:** Leitung → Datensicherung → „Sicherung herunterladen“. Die JSON-Datei enthält `einrichtungen`, `benutzer` (Profile ohne Passwörter) und `kontrollen` in einem flachen, dokumentierten Format.
2. **Backend bauen:** beliebig (z. B. PHP/Node + MariaDB/PostgreSQL, Anmeldung per AD/LDAP). Tabellen 1:1 aus der JSON-Struktur ableiten.
3. **`js/datastore.js` ersetzen:** dieselben Funktionen exportieren (`onAuth`, `login`, `logout`, `passwortAendern`, `listEinrichtungen`, `saveEinrichtung`, `kontrollenAm`, `kontrollenZeitraum`, `saveKontrolle`, `listBenutzer`, `createBenutzer`, `updateBenutzer`, `exportAlles`, `importAlles`), nur dass sie statt Firebase die eigene API per `fetch` aufrufen. `app.js` und `export.js` bleiben unverändert.
4. Statische Dateien auf den Webserver kopieren, JSON-Sicherung ins neue Backend importieren.

### Datenformat einer Kontrolle
```json
{
  "id": "2026-10-27_abc123",
  "datum": "2026-10-27",
  "einrichtungId": "abc123",
  "einrichtungName": "Grundschule St. Josef",
  "einrichtungTyp": "Grundschule",
  "status": "mangel",
  "nichtGeputzt": false,
  "nichtSauber": true,
  "bemerkung": "Toiletten EG",
  "erfasstVon": "<uid>",
  "erfasstVonName": "Max Muster",
  "erfasstAm": "2026-10-27T06:42:10.000Z"
}
```
