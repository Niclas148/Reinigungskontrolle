# Reinigungskontrolle – Grundschulen und Kitas der Kreisstadt Merzig

Hausmeister prüfen morgens, ob ihre Einrichtungen geputzt und sauber sind, und melden Mängel (optional mit Bemerkung). Die Leitung sieht alle Einträge, erstellt Auswertungen als PDF und Excel und kann sie per Mail weitergeben.

## Aufbau

| Datei | Zweck |
|---|---|
| `index.html`, `css/style.css` | Oberfläche |
| `js/app.js` | Ansichten für Hausmeister und Leitung |
| `js/export.js` | PDF- und Excel-Export, Mailversand |
| `js/datastore.js` | **Einzige Datei mit Firebase-Bezug** (wichtig für den Umzug) |
| `js/firebase-config.js` | Zugangsdaten des Firebase-Projekts |
| `firestore.rules` | Zugriffsregeln der Datenbank |

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

**Hausmeister:** Anmelden → für jede Einrichtung „Alles sauber“ oder „Mangel melden“ (ankreuzen: nicht geputzt / nicht sauber, Bemerkung freiwillig). Ein Eintrag pro Einrichtung und Tag; erneutes Speichern überschreibt ihn.

**Leitung:**
- *Tagesübersicht*: Stand eines Tages, offene Einrichtungen grau.
- *Auswertung*: Zeitraum und Filter wählen → PDF, Excel oder „Per Mail senden“. Am Handy und in Edge/Chrome unter Windows öffnet sich der Teilen-Dialog mit beiden Dateien im Anhang; sonst werden die Dateien heruntergeladen und das Mailprogramm geöffnet.
- *Einrichtungen*, *Benutzer*: Pflege. Einrichtungen und Konten werden deaktiviert statt gelöscht, damit die Historie erhalten bleibt.
- *Datensicherung*: kompletter Export als JSON.

„Werktage ohne Eintrag“ zählt Montag bis Freitag; Feiertage und Ferien werden nicht abgezogen.

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
