# Kampagnen-Tracker

Visuelles Team-Tool, um Marketingkampagnen zu planen, zu ordnen und zu tracken
(Dashboard → Kampagne → Funnel-Stufe → Kanal → Asset). Projekt-Briefing: siehe `CLAUDE.md`.

## Setup

Voraussetzung: Node.js 20+.

```bash
npm install            # installiert Abhängigkeiten und generiert den Prisma Client
cp .env.example .env   # lokale Einstellungen (SQLite-Datei, Storage, Dev-User)
npm run db:push        # Datenbankschema anlegen (SQLite: prisma/dev.db)
npm run db:seed        # Stammdaten + 3 fiktive Beispielkampagnen laden (löscht vorhandene Daten)
npm run dev            # http://localhost:3000
```

Weitere Befehle:

| Befehl | Zweck |
| --- | --- |
| `npm test` | Unit-Tests (Vitest) |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run lint` | ESLint |
| `npm run db:reset` | Datenbank leeren, Schema neu anlegen, Seed laden |
| `npm run db:studio` | Prisma Studio (Daten im Browser ansehen) |

## Struktur

```
prisma/
  schema.prisma          Datenmodell (SQLite lokal, Postgres-kompatibel)
  seed.ts                Stammdaten, Demo-User, Beispielkampagnen
src/
  app/                   Next.js App Router (Seiten)
    page.tsx             Dashboard (Kennzahlen, Filter, Kampagnenkarten, Kritisch-Bereich)
    vergleich/           Kampagnen nebeneinander vergleichen (?k=slug-a,slug-b)
    kampagnen/neu        Launch-Charter-Wizard (neue Kampagne)
    kampagnen/[slug]     Mindmap (Kernansicht), Funnel-Ansicht, Charter-Ansicht, Charter bearbeiten
    kampagnen/actions.ts Server Actions: Kampagne aus Charter anlegen, Charter versioniert ändern
    kampagnen/entity-actions.ts  Server Actions: Kanäle/Assets anlegen, ändern, löschen, Status setzen
  components/            UI-Komponenten (shadcn/ui-Konventionen, components.json)
    ui/                  Basiskomponenten (Button, Input, Select, Field …)
    charter/             Wizard und seine Schritte
    dashboard/           Filterleiste, Kampagnenkarte, Vergleichsauswahl, Kritisch-Liste
    mindmap/             React-Flow-Mindmap, Knoten, Detail-Panel, Kanal-/Asset-Formulare
  lib/
    config.ts            zentrale Schwellen (z. B. „fällig in 7 Tagen“), Zeitzone, Locale
    dates.ts             Tagesvergleich in Europe/Berlin, Formatierung TT.MM.JJJJ / EUR
    domain/              feste Wertelisten (Funnel-Stufen, Status, Rollen …) und Kanaltypen
    status/              abgeleitete Status-Logik (Fortschritt, Ampel, Phase, Rollup) + Tests
    validation/          Zod-Schemas (Charter-Daten, KPI-Ziele, Märkte …), gemeinsame Feld-Schemas
    charter/             Wizard-Formular (Zod), Erzeugung von Kampagne/Kanälen/Assets aus der Charter + Tests
    dashboard/           Filter (URL-Parameter), Sortierung, Kritisch-Listen, Kennzahlen, Zeitleiste + Tests
    entities/            Kanal-/Asset-Formulare (Zod), Änderungserkennung fürs Activity Log + Tests
    mindmap/             Graph-Aufbau mit Status-Rollup und Baum-Layout + Tests
    format.ts            deutsche Zahleneingabe, Cent-Umrechnung, Slugs, Datumsfelder
    queries.ts           Datenzugriff für die Seiten
    auth/                Auth-Abstraktion (heute: Dev-User, später Auth.js + Entra ID)
    storage/             Storage-Abstraktion (heute: lokales Dateisystem)
    db.ts                Prisma Client
```

## Designentscheidungen

- **Postgres-Kompatibilität:** Feste Wertelisten (Funnel-Stufe, Asset-Status, Rolle, Link-Typ …)
  sind als Strings gespeichert und werden per Zod geprüft (SQLite kennt in Prisma keine Enums).
  Listen/Key-Value-Daten (Märkte, Partner, KPI-Ziele, Charter-Inhalt) sind `Json`.
  Beträge werden als Integer-Cent (EUR) gespeichert.
- **Abgeleiteter Status wird nie gespeichert**, sondern in `src/lib/status` berechnet:
  - Fortschritt = Assets in `FERTIG`/`LIVE` ÷ alle Assets; `ABGEBROCHEN` zählt nicht mit.
  - Ampel **Rot**: ein Asset ist überfällig (Fälligkeit vor heute) und nicht fertig;
    `PAUSIERT` zählt dabei als nicht fertig, `ABGEBROCHEN` wird ignoriert.
  - Ampel **Gelb**: ein Asset ist heute oder in den nächsten 7 Tagen fällig und noch nicht in
    `FREIGABE` oder später.
  - Phase: `Abgeschlossen` nach Enddatum; `Live` ab Startdatum oder sobald ein Asset live ist;
    `In Arbeit` sobald ein Asset über `IDEE` hinaus ist; sonst `Planung`.
  - „Heute“ und Fälligkeiten werden als Kalendertag in Europe/Berlin verglichen.
- **Launch Charter** ist versioniert: `LaunchCharter.data` enthält den aktuellen Stand, jede
  Änderung schreibt zusätzlich eine unveränderliche `LaunchCharterVersion`.
- **Launch Charter → Kampagne:** Beim Anlegen erzeugt `buildCampaignPlan` (getestet) aus der Charter
  Kampagne, Kanäle (mit KPI-Zielen und ggf. geänderter Funnel-Stufe), Assets (Status `IDEE`) und
  Links – alles in einer Transaktion, plus Activity-Log-Eintrag. Der Basis-Teil (Name, Zeitraum,
  Märkte …) wird zusätzlich als Snapshot in jeder Charter-Version gespeichert.
- **Charter bearbeiten** ändert Basis, Strategie, Budget, Links und Stakeholder und legt eine neue
  Version an (mit optionaler Änderungsnotiz; der Verlauf zeigt die geänderten Abschnitte).
  Kanäle und Assets werden danach in der Kampagne gepflegt (ab Phase 3 in der Mindmap).
- **Zahlen-Eingaben** sind im deutschen Format (`25.000`, `1.500,50`). Ein ungespeicherter
  Wizard-Entwurf wird im Browser (localStorage) gehalten und kann wiederhergestellt werden.
- **Mindmap-Layout:** eigenes, getestetes Baum-Layout (`src/lib/mindmap/graph.ts`) statt dagre/elk –
  die Struktur ist fest vierstufig (Kampagne → Stufe → Kanal → Asset), so bleibt die Anordnung
  stabil und vorhersagbar: Baum von links nach rechts, Funnel-Stufen von oben nach unten,
  jeder Knoten mittig zu seinen Kindern. Knoten sind nicht frei verschiebbar.
- **Dashboard-Filter** stehen in der URL (z. B. `/?markt=DE,AT&phase=LIVE&ampel=RED&sortierung=ampel`),
  gefilterte Ansichten lassen sich also als Link teilen. Markt: Kampagne läuft in mindestens einem der
  gewählten Märkte. Zeitraum: Kampagnenzeitraum überschneidet sich mit dem gewählten Zeitraum.
  Kennzahlen und Kritisch-Bereich beziehen sich auf die gefilterten Kampagnen.
- **Activity Log:** Anlegen, Ändern (mit geänderten Feldern), Verschieben, Löschen und
  Statuswechsel (`status_changed` mit von/nach) von Kanälen und Assets werden protokolliert.
- **Links** hängen über echte Fremdschlüssel an Kampagne, Kanal oder Asset (Cascade-Delete).
  **Kommentare** und **Activity Log** hängen generisch über `entityType` + `entityId` an jedem Objekt.
- **Farben:** Josera Gold/Ruby nur als UI-Akzent. Ampelfarben sind eigene Tokens
  (`status-red/yellow/green`), Ruby wird nie als Fehler-Rot verwendet. Funnel-Stufen haben je eine
  ruhige Farbe (`stage-awareness/consideration/sales`). Hell-/Dunkelmodus folgt der Systemeinstellung.

## Stand

### Phase 1 – Grundgerüst ✅

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4, shadcn/ui-Basis (`components.json`, `cn`)
- Prisma-Schema mit allen Entitäten aus dem Briefing (User, Campaign, LaunchCharter inkl.
  Versionen, ChannelType, Channel, Asset, Link, KpiReport, KpiValue, KpiImportMapping, Comment,
  ActivityLog)
- Seed: 16 Kanaltypen mit Default-Funnel-Stufe, 6 Demo-User (alle Rollen), 3 fiktive Kampagnen,
  die gemeinsam alle Ampel- und Phasenzustände abdecken (Daten relativ zum Seed-Datum)
- Getestete Status- und Rollup-Logik (Vitest), zentrale Schwellen in `src/lib/config.ts`
- Auth- und Storage-Abstraktion als austauschbare Schichten
- Kontrollseite `/`: Kampagnenkarten mit Ampel, Phase, Fortschritt und Funnel-Rollup
  (das eigentliche Dashboard folgt in Phase 4)

### Phase 2 – Launch Charter ✅

- Wizard `/kampagnen/neu` mit 7 Schritten + Prüfseite: Basis, Strategie, Budget (inkl. Aufteilung
  nach Funnel-Stufe), Kanäle (gruppiert nach Funnel-Stufe, KPI-Ziele, Stufe änderbar, Duplizieren
  z. B. pro Markt), Assets, Links, Stakeholder/Freigabeprozess
- Validierung pro Schritt mit deutschen Fehlermeldungen; Server prüft erneut (inkl. Rechte und
  existierender Nutzer/Kanaltypen)
- Automatische Erzeugung von Kampagne, Kanälen, Assets, Links und Charter-Version 1
- Kampagnenseite mit Funnel-Spalten (Ampel/Fortschritt je Stufe und Kanal, KPI-Ziele, Assets mit
  Fälligkeit und Status) und Link-Leiste
- Charter-Ansicht: lesbare, druckbare Zusammenfassung (Abschnitte 1–7) mit Versionsverlauf
- Charter bearbeiten → neue Version, Änderungen am Kampagnen-Datensatz und an Charter-Links
- Entwurf-Wiederherstellung, Warnung beim Verlassen mit ungespeicherten Änderungen
- Startseite: Karten verlinken auf die Kampagne, Button „Neue Kampagne“

### Phase 3 – Mindmap ✅

- Kampagnenseite `/kampagnen/[slug]` zeigt jetzt die Mindmap (React Flow): Kampagne → Awareness /
  Consideration / Sales → Kanäle → Assets; Kanten in der Farbe der Funnel-Stufe
- Knoten nach Status eingefärbt: Kampagne, Stufen und Kanäle mit Ampel und Fortschritt (x/y),
  Assets nach Asset-Status, überfällige Assets rot umrandet, bald fällige orange markiert
- Zoom, Pan, „Einpassen“, Ein-/Ausklappen von Stufen und Kanälen (wird pro Kampagne im Browser
  gemerkt), „Alles ausklappen“ / „Assets einklappen“, Legende
- Detail-Panel per Klick: Kampagne (Stufen, überfällige Assets, Links), Stufe (Kanäle), Kanal
  (bearbeiten inkl. Stufe verschieben und KPI-Zielen, löschen, Assets), Asset (Status-Schnellwahl,
  bearbeiten, löschen, Links); Navigation zwischen den Ebenen im Panel
- „+“ an Stufe bzw. Kanal legt direkt einen Kanal bzw. ein Asset an
- Direktlinks: `/kampagnen/<slug>?asset=<id>` bzw. `?kanal=<id>` öffnet das Element (klappt auf)
- Viewer sehen alles, können aber nichts ändern; die Server Actions prüfen die Rechte zusätzlich
- Die bisherige Spaltenansicht ist jetzt der Tab „Funnel“

### Phase 4 – Dashboard ✅

- Kennzahlen: Kampagnen, Live, Kritisch (rot), überfällige und bald fällige Assets
- Filter: Suche (Name/Marke/Produktlinie), Markt, Phase, Ampel (Mehrfachauswahl), Marke,
  Produktlinie, Owner, Umsetzung, Zeitraum; Sortierung nach Start, Ende, Dringlichkeit oder Name;
  „Filter zurücksetzen“
- Kampagnenkarten mit Ampel, Phase, Zeitraum, Fortschritt, Markt-Badges, Funnel-Rollup und offenen
  Terminen; Klick öffnet die Mindmap
- Bereich „Kritisch“ mit Tabs „Überfällig“ / „Bald fällig“ über alle (gefilterten) Kampagnen;
  jeder Eintrag springt direkt zum Asset in der Mindmap
- Vergleich: bis zu 4 Kampagnen per „Vergleichen“ auswählen → `/vergleich` mit gemeinsamer
  Zeitleiste (inkl. Heute-Markierung) und Gegenüberstellung von Eckdaten, Budget je Stufe,
  Fortschritt und Ampel je Funnel-Stufe, überfälligen/bald fälligen Assets

### Als Nächstes

Phase 5 – Links & Integrationen: Frontify-, SharePoint-, Looker-Studio-Links an Kampagne, Kanal
und Asset pflegen, Looker-Einbettung.
