export const KPI_SUGGESTIONS = [
  "Impressions",
  "Reichweite",
  "Views",
  "Completion Rate %",
  "Klicks",
  "CTR %",
  "CPM",
  "Engagement Rate %",
  "Follower",
  "Sessions",
  "Verweildauer s",
  "Öffnungsrate %",
  "Leads",
  "Conversions",
  "Umsatz",
  "ROAS",
  "Platzierungen",
  "Abverkauf Stück",
  "Verteilte Pakete",
];

/** Suggestions for KPI name inputs (`list="kpi-options"`). Render once per page. */
export function KpiDatalist() {
  return (
    <datalist id="kpi-options">
      {KPI_SUGGESTIONS.map((k) => (
        <option key={k} value={k} />
      ))}
    </datalist>
  );
}
