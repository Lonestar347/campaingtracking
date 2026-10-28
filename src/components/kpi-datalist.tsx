export const KPI_SUGGESTIONS = [
  "Impressions",
  "Reach",
  "Views",
  "Completion rate %",
  "Clicks",
  "CTR %",
  "CPM",
  "CPC",
  "Engagement rate %",
  "Followers",
  "Sessions",
  "Time on page (s)",
  "Open rate %",
  "Leads",
  "Conversions",
  "Revenue",
  "ROAS",
  "Placements",
  "Units sold",
  "Samples distributed",
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
