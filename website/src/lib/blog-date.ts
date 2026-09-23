/**
 * A frontmatter date (YYYY-MM-DD) as "March 22, 2026". It is a calendar day, so it is formatted in UTC: parsing it as
 * UTC midnight and printing in the viewer's timezone would show the day before west of Greenwich.
 */
export function formatBlogDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
