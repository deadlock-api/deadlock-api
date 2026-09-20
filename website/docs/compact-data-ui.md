# Compact data views

Rules for analytics and other data-heavy pages, on top of `docs/design-system.md`. The hero over-time page is the reference implementation.

| Need                      | Component                                  | Behavior                                                                                       |
| ------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Page heading              | `patterns/page/PageHeader`                 | Compact title and description; longer context in an accessible disclosure.                     |
| Chart controls            | `patterns/charts/ChartToolbar`             | One compact row on desktop; controls wrap on narrow screens.                                   |
| Large metric option sets  | `patterns/charts/MetricSelect`             | Grouped options, explicit accessible label, and a stable label during SSR.                     |
| Historical chart controls | `patterns/charts/TrendControls`            | Metric menu and interval toggle group; route components own URL state.                         |
| Plot surface              | `patterns/charts/ChartSurface`             | 280px mobile / 320px desktop; semantic card colors. Override height for dense scatter plots.   |
| Chart and entity picker   | `patterns/charts/ChartSidebarLayout`       | 18rem sidebar at large widths, matching the chart panel's height; stacked on mobile.           |
| Hero selection            | `domain/selectors/ChartHeroSelector`       | Portrait grid, selected count, Show all/Clear, unavailable heroes disabled, scrollable roster. |
| Chart readings            | `patterns/charts/ChartReadings`            | Aligned values, bounded and keyboard-scrollable when many series are present.                  |
| Query feedback            | `patterns/charts/ChartStates`              | Loading skeleton, actionable retry, and distinct empty results.                                |
| Sortable columns          | `patterns/data-table/SortableHeader`       | Native buttons, focus indication, and `aria-sort`; accepts any string key.                     |
| Dense comparative bars    | `ui/progress-bar` (`ProgressBarWithLabel`) | `compact` puts the bar and numbers on one row.                                                 |

## Layout and interaction

- Prefer a 12px gap between data sections. Keep labels close to their controls.
- Keep dense table rows around 40px, with tabular numbers. Item tables pin the identity column while scrolling; use an opaque background and retain a full-name title on truncated labels.
- Tables inherit the shared thin scrollbar. Other scrollable data panels can use `scrollbar-thin`, `overscroll-contain`, and a stable scrollbar gutter.
- Chart elements suppress text selection globally. Table values remain selectable for copying.
- Keep selected metrics, intervals, and filters in the URL when the page already supports URL state.
- Preserve semantic headings, keyboard controls, and native focus behavior as density increases.

## Chart data and performance

- Preserve raw numeric precision; format only at display boundaries.
- Missing observations are gaps, not zeros. Explain sample thresholds when observations are omitted.
- Label time data in UTC and include years in the visible range when an axis uses short dates.
- Render only selected series. Dense line charts should avoid a marker component for every observation; isolated observations must remain visible.
- Disable unnecessary chart animation. Hero trends also bypass SVG path-length measurement for their static curves.
- Keep tooltip lists bounded so all selected series remain reachable without covering the whole page.
- A failed request must offer retry rather than appearing as an empty result. Preserve filters during retry.
