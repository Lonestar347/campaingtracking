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
  components/            UI-Komponenten (shadcn/ui-Konventionen, components.json)
  lib/
    config.ts            zentrale Schwellen (z. B. „fällig in 7 Tagen“), Zeitzone, Locale
    dates.ts             Tagesvergleich in Europe/Berlin, Formatierung TT.MM.JJJJ / EUR
    domain/              feste Wertelisten (Funnel-Stufen, Status, Rollen …) und Kanaltypen
    status/              abgeleitete Status-Logik (Fortschritt, Ampel, Phase, Rollup) + Tests
    validation/          Zod-Schemas (Charter-Daten, KPI-Ziele, Märkte …)
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

### Als Nächstes

Phase 2 – Launch Charter: Wizard zum Anlegen, Charter-Ansicht, automatische Erzeugung von
Funnel/Kanälen/Assets.
