# Kampagnen-Tracker – Projekt-Briefing

## Ziel
Ein visuelles Team-Tool, um Marketingkampagnen von Josera zu planen, zu ordnen und zu tracken. Jederzeit soll ein schneller Überblick über den Status einer oder mehrerer Kampagnen möglich sein – vom Dashboard per Klick bis hinunter zum einzelnen Asset. Die Bedienung ist visuell (Mindmap-Logik), nicht tabellarisch.

## Nutzer & Rollen
- Nutzung durch das Marketing-Team (Brand, Design, Content, Social Media, Digital Marketplaces, Sales DE/International).
- Von Anfang an mehrbenutzerfähig modellieren (User, Owner pro Objekt, Kommentare, Änderungsprotokoll).
- Rollen (zunächst einfach): `admin`, `editor`, `viewer`.
- Login und Server-Deployment kommen später. Bis dahin: lokaler Betrieb, Auth als austauschbare Schicht vorbereiten (später voraussichtlich Microsoft-SSO, da SharePoint/M365 im Einsatz).

## Hierarchie / Datenmodell
```
Dashboard
└── Kampagne            (angelegt über die Launch Charter)
    └── Funnel-Stufe    (Awareness | Consideration | Sales – fest)
        └── Kanal       (z. B. Social, POS, Amazon …)
            └── Asset   (einzelnes Content-Stück)
```

### Entitäten
- **Campaign**: name, slug, description, objective, keyMessage, startDate, endDate, budget, markets (DE/AT/PL, Mehrfachauswahl), brand/productLine, owner, partners (Agentur/Produktion, Freitext oder Liste), executionType (`agency` | `inhouse` | `mixed`), status (abgeleitet, siehe unten), createdAt/updatedAt.
- **LaunchCharter**: 1:1 zur Kampagne, enthält die strukturierten Startinfos (siehe Abschnitt Launch Charter). Versioniert, damit Änderungen nachvollziehbar sind.
- **FunnelStage**: fest `AWARENESS`, `CONSIDERATION`, `SALES` – als Enum, nicht als Tabelle mit Nutzerpflege.
- **Channel**: campaignId, funnelStage, channelType, name, owner, startDate, endDate, kpiTargets (JSON: KPI-Name → Zielwert), notes.
- **ChannelType** (pflegbare Stammdaten mit Default-Funnel-Stufe):
  - Awareness: Kino/Placement, TV/CTV, OOH, Social Reach (Paid), Influencer, PR/Presse
  - Consideration: Social Engagement/Organic, Website/Ratgeber-Content, Newsletter/CRM, Events/Messen, Sampling
  - Sales: POS/Handel, Digital Marketplaces (Amazon, Zooplus …), Onlineshop, Promotions/Aktionen, B2B/Handelsmarketing
  - Die Default-Stufe ist vorbelegt, kann pro Kampagne aber geändert werden.
- **Asset**: channelId, title, assetType (Video, Static, Carousel, Story, Print, Display, Text …), format/specs, status, dueDate, owner, approver, links (siehe Link), notes.
- **Link**: zu Kampagne, Kanal oder Asset; type (`frontify` | `sharepoint` | `looker_studio` | `other`), url, label, optional Vorschaubild.
- **KpiReport**: Upload eines externen Excel-Reports; campaignId, optional channelId, source (Agentur/Partner), periodStart, periodEnd, originalFile, uploadedBy, uploadedAt.
- **KpiValue**: reportId, channelId, kpiName, value, unit, date (optional).
- **Comment**: an jedem Objekt, mit Autor und Zeitstempel.
- **ActivityLog**: wer hat wann was geändert (Statuswechsel, Uploads, Charter-Änderungen).
- **User**: name, email, role, team.

## Launch Charter
Formular (mehrstufig, Wizard), mit dem eine neue Kampagne angelegt wird. Felder:
1. **Basis**: Kampagnenname, Marke/Produktlinie, Märkte, Zeitraum, Owner, Agentur vs. Inhouse
2. **Strategie**: Ziel/Objective, Zielgruppe, Kernbotschaft, Insight, Reason to Believe
3. **Budget**: Gesamtbudget, optional Aufteilung nach Funnel-Stufe
4. **Kanäle**: Auswahl aus ChannelTypes, gruppiert nach Awareness / Consideration / Sales; pro Kanal KPI-Ziele
5. **Assets (optional)**: erste Asset-Liste pro Kanal
6. **Links**: Frontify-Ordner, SharePoint-Ordner, Looker-Studio-Report
7. **Stakeholder**: beteiligte Teams und Personen, Freigabeprozess

Nach dem Speichern wird die Mindmap der Kampagne automatisch aus der Charter erzeugt. Die Charter bleibt als eigene, druck-/exportierbare Ansicht erhalten (später PDF-Export).

## Status-Logik
- Status wird **nur auf Asset-Ebene** gepflegt:
  `IDEE → BRIEFING → IN_PRODUKTION → FREIGABE → FERTIG → LIVE` (+ `PAUSIERT`, `ABGEBROCHEN`)
- Kanal, Funnel-Stufe und Kampagne leiten ihren Status automatisch ab:
  - Fortschritt = Anteil Assets in `FERTIG` oder `LIVE` (z. B. „3/5“)
  - Ampel:
    - **Rot**: mindestens ein Asset über Deadline und nicht fertig
    - **Gelb**: mindestens ein Asset in den nächsten 7 Tagen fällig und noch nicht in `FREIGABE` oder später
    - **Grün**: sonst
  - Kampagnenphase (abgeleitet aus Datum + Assets): `Planung`, `In Arbeit`, `Live`, `Abgeschlossen`
- Schwellen (z. B. 7 Tage) zentral konfigurierbar.

## Ansichten
1. **Dashboard**
   - Alle Kampagnen als Karten oder Bubbles mit Ampel, Zeitraum, Fortschritt, Markt-Badges
   - Filter: Markt, Marke/Produktlinie, Owner, Agentur/Inhouse, Phase, Zeitraum
   - Mehrfachauswahl, um mehrere Kampagnen nebeneinander zu vergleichen
   - Hinweisbereich „Kritisch“: überfällige Assets über alle Kampagnen
2. **Kampagnen-Mindmap** (Kernansicht)
   - Kampagne im Zentrum, drei Äste Awareness / Consideration / Sales, daran Kanäle, daran Assets
   - Knoten eingefärbt nach Status, Fortschritt am Knoten sichtbar
   - Zoom, Pan, Ein-/Ausklappen von Ästen
   - Klick auf Knoten öffnet seitliches Detail-Panel (bearbeiten, Links, Kommentare, KPIs)
   - Neue Kanäle/Assets direkt in der Mindmap anlegen (+ am Knoten)
3. **Funnel-Ansicht** pro Kampagne: drei Spalten Awareness / Consideration / Sales mit Kanälen und KPI-Zielen vs. Ist-Werten
4. **Launch-Charter-Ansicht**: lesbare Zusammenfassung der Charter
5. **Performance**: hochgeladene KPI-Reports, Ziel vs. Ist pro Kanal, Links zu Looker Studio
6. **Später**: Timeline/Gantt über alle Kampagnen (Kollisionen erkennen)

## Integrationen
- **Frontify**: zunächst Links (Ordner/Asset-URL) an Kampagne, Kanal, Asset; Anzeige mit Icon und optional Vorschaubild. Später: Frontify-API für Asset-Vorschau und Statussync.
- **SharePoint**: zunächst Links zu Ordnern/Dokumenten. Später: Microsoft Graph API (gemeinsam mit SSO).
- **Looker Studio** (ehem. Data Studio): Links pro Kampagne/Kanal; optional Einbettung per iframe im Performance-Tab (funktioniert nur, wenn der Report für Einbettung freigegeben ist – sonst Fallback auf Link).
- **Excel-Upload für externe Reports** (.xlsx/.csv):
  - Upload pro Kampagne, optional Kanal-Zuordnung
  - Mapping-Dialog: Spalten der Datei → KPI-Name, Kanal, Datum, Wert; Mapping pro Quelle (Agentur) speicherbar, damit wiederkehrende Reports automatisch erkannt werden
  - Originaldatei wird mit gespeichert
  - Validierung mit klaren Fehlermeldungen (fehlende Spalten, ungültige Zahlen)

## Tech-Stack (Vorschlag)
- **Next.js (App Router) + TypeScript**
- **React Flow** (`@xyflow/react`) für die Mindmap, Auto-Layout mit `elkjs` oder `dagre`
- **Tailwind CSS** + **shadcn/ui** für Formulare, Panels, Dialoge
- **Prisma** als ORM; lokal **SQLite**, später **PostgreSQL** auf dem Server (Schema von Anfang an Postgres-kompatibel halten)
- **SheetJS** (`xlsx`) für Excel-Import
- **Zod** für Validierung (Formulare, Uploads, API)
- **Recharts** für Ziel-vs.-Ist-Diagramme
- Auth: Abstraktion vorbereiten, später **Auth.js mit Microsoft Entra ID**
- Datei-Uploads: lokal im Dateisystem, über eine Storage-Abstraktion, damit später SharePoint/Blob-Storage möglich ist

## Design
- Josera CI für UI-Akzente: Josera Gold `#FECC00`, Josera Ruby `#E2001A`, Schwarz `#000000`, Weiß `#FFFFFF`
- Status-/Ampelfarben bewusst getrennt von den CI-Farben halten (Ruby nicht als „Fehler-Rot“ verwenden, sonst Verwechslungsgefahr)
- Funnel-Stufen mit je einer eigenen, ruhigen Farbe, konsistent in Mindmap, Funnel-Ansicht und Dashboard
- Hell- und Dunkelmodus, responsive (Desktop zuerst, Tablet nutzbar)

## Umsetzungsphasen
1. **Grundgerüst**: Projekt-Setup, Prisma-Schema, Seed-Daten mit 2–3 Beispielkampagnen, ChannelType-Stammdaten
2. **Launch Charter**: Wizard zum Anlegen, Charter-Ansicht, automatische Erzeugung von Funnel/Kanälen/Assets
3. **Mindmap**: React-Flow-Ansicht mit Detail-Panel, Bearbeiten und Anlegen im Graph, Status-Rollup
4. **Dashboard**: Karten, Filter, Ampeln, Kritisch-Bereich
5. **Links & Integrationen**: Frontify-, SharePoint-, Looker-Studio-Links, Looker-Einbettung
6. **Excel-Import**: Upload, Mapping-Dialog, gespeicherte Mappings, Ziel-vs.-Ist-Ansicht
7. **Team-Features**: Kommentare, Activity Log, Rollen
8. **Später**: Auth/SSO, Server-Deployment, Timeline, PDF-Export der Charter, API-Integrationen

Nach jeder Phase: lauffähiger Stand, kurze Notiz im README, was fertig ist.

## Konventionen
- UI-Sprache Englisch (britisch); Code, Variablen, Commits auf Englisch
- Datumsformat DD/MM/YYYY, Währung EUR (zentral in `src/lib/config.ts`)
- Status- und Rollup-Logik in eigenen, getesteten Funktionen (Unit-Tests mit Vitest)
- Keine echten Kampagnendaten in Seed-Dateien

## Nicht im Scope (vorerst)
- Server-Deployment und produktives Login
- Automatischer Datenabgleich mit Frontify/SharePoint/Looker per API
- Budget-Controlling über reine Planwerte hinaus
