/**
 * The showcase's table of contents: chapter > group > specimen. A Specimen whose name is missing here warns in the
 * console. The grouping is by what a component is for, which is how someone looks for one.
 */
export interface NavGroup {
  title: string;
  items: readonly string[];
}
export interface NavChapter {
  id: string;
  title: string;
  groups: readonly NavGroup[];
}

export const NAV: readonly NavChapter[] = [
  {
    id: "foundations",
    title: "Foundations",
    groups: [
      {
        title: "Color",
        items: ["Surfaces", "Translucent layers", "Ink and brand", "Status", "Chart series", "Game and third-party"],
      },
      { title: "Scales", items: ["Type scale", "Radius", "Shadow", "Control height"] },
    ],
  },
  {
    id: "layout",
    title: "Layout and type",
    groups: [
      { title: "Layout", items: ["Stack", "Inline", "Grid", "Box"] },
      { title: "Type", items: ["Text", "Heading", "Heading font", "Kbd", "Code", "NoValue", "InlineStat"] },
    ],
  },
  {
    id: "primitives",
    title: "Primitives",
    groups: [
      {
        title: "Actions",
        items: [
          "Button",
          "Button additions",
          "Button states",
          "Button elevation",
          "Button text and scrim",
          "CopyButton",
          "CopyButton label",
          "TextLink",
          "SortButton",
          "SortButton size",
          "Toggle",
          "ToggleGroup",
          "Segmented",
          "Segmented items",
        ],
      },
      {
        title: "Forms",
        items: [
          "Field",
          "Field messages",
          "Field states",
          "Control states",
          "Input spinners",
          "Input",
          "SearchInput",
          "Textarea",
          "ColorInput",
          "Select",
          "Checkbox and Switch",
          "CheckboxField",
          "SwitchField",
          "Slider",
          "Calendar",
        ],
      },
      {
        title: "Surfaces",
        items: [
          "Card",
          "Card floating and radius",
          "Card accent and outline",
          "IconTile",
          "IconTile variants",
          "Separator",
          "Avatar",
          "Collapsible",
        ],
      },
      {
        title: "Data display",
        items: [
          "Badge",
          "Badge circle",
          "CornerBadge",
          "StatusDot",
          "Stat",
          "Delta",
          "Delta unit, icon, badge",
          "KeyValueList",
          "Pips",
          "StepMeter",
          "TableRow states",
          "TableHeader tone and position",
          "TableBody group states",
          "HeatCell",
          "StatusDot ring",
          "MaskedIcon",
        ],
      },
      {
        title: "Bars",
        items: [
          "ProgressBar",
          "ProgressBar variants",
          "ProgressBarWithLabel orientation",
          "RateBar",
          "SplitBar",
          "DivergingBar interval",
        ],
      },
      {
        title: "Navigation",
        items: ["Tabs", "Nested Tabs", "OptionRow", "OptionRow link and description"],
      },
      {
        title: "Overlays",
        items: [
          "Tooltip",
          "PanelTooltip",
          "DetailPopover",
          "Details affordance",
          "SelectionBox",
          "Popover and HoverCard",
          "Dialog",
          "AlertDialog",
          "Sheet",
          "Sonner",
        ],
      },
      { title: "Feedback", items: ["Alert", "Alert negative", "Skeleton", "Spinner", "LoadingLogo", "Empty"] },
      { title: "Media", items: ["ImgWithSkeleton", "OptimizedImage"] },
    ],
  },
  {
    id: "patterns",
    title: "Patterns",
    groups: [
      {
        title: "Page",
        items: [
          "AppBody, PageBackdrop and AppFrame",
          "PageShell",
          "PageShell align and height",
          "PageHeader",
          "Section",
          "Hero",
        ],
      },
      {
        title: "Content",
        items: ["LinkCard", "CalloutCard", "Disclosure", "Prose", "Steps", "BulletList", "MetaList", "LogoWall"],
      },
      {
        title: "Navigation",
        items: ["SideNavShell", "SideNav", "SideNavSection", "Breadcrumb", "ResponsiveTabsList", "DragScroll"],
      },
      {
        title: "Filter bar",
        items: [
          "FilterBar cells",
          "FilterBar toolbar",
          "FilterBar position and FilterCell contentClassName",
          "FilteredSelectPopover",
          "FilterCell states",
        ],
      },
      {
        title: "Data table",
        items: [
          "Data table",
          "PaginationControls",
          "PaginatedTable",
          "ExpandableRow",
          "ResultGrid",
          "ComparisonTable",
          "Table states",
        ],
      },
      { title: "Panel", items: ["Panel", "PanelWithDetails", "PanelSection", "PanelSection tone and position"] },
      {
        title: "States",
        items: [
          "LoadingState",
          "LoadingState align",
          "Skeletons",
          "EmptyState",
          "ErrorState",
          "ErrorState as a boundary fallback",
          "QueryRenderer",
          "ChunkErrorBoundary",
          "Result states",
          "StaleOverlay",
        ],
      },
      {
        title: "Code",
        items: ["HighlightedCode", "HighlightedCode actions and overflow", "CopyableCode", "CopyableUrl"],
      },
    ],
  },
  {
    id: "charts",
    title: "Charts",
    groups: [
      {
        title: "Building blocks",
        items: [
          "Series palette",
          "ChartSurface",
          "ChartCard",
          "ChartLegend",
          "ChartLegend items and toggles",
          "ChartReadings",
          "ChartReadings rows",
          "Chart states",
          "ChartEmpty and ChartError size",
          "ChartOverlay",
          "ChartRegion",
        ],
      },
      { title: "Controls and layout", items: ["ChartToolbar", "MetricSelect", "TrendControls", "ChartSidebarLayout"] },
      {
        title: "Ready-made charts",
        items: ["WinRateBarChart", "StatTrendChart", "StatTrendHoverCard", "WeeklyTrendChart", "StatTrendChart states"],
      },
    ],
  },
  {
    id: "domain",
    title: "Domain",
    groups: [
      {
        title: "Assets",
        items: [
          "HeroImage and HeroName",
          "ItemImage and ItemName",
          "AbilityImage and AbilityName",
          "AssetImage",
          "BadgeImage",
          "BadgeImage inline",
          "HeroImage shape and ring",
          "HeroImage ringColor",
          "AssetImage emphasis",
          "HeroCell and ItemCell",
          "RankedEntityGrid",
        ],
      },
      { title: "Rank", items: ["RankTierIcons", "RankTierTick"] },
      {
        title: "Selectors",
        items: [
          "HeroSelector",
          "HeroSelectorMultiple",
          "HeroSelectionGrid",
          "ChartHeroSelector",
          "ItemSelectorMultiple",
          "ItemSlotSelector and ItemTierSelector",
          "ModeSelector",
          "RankRangeSelector",
          "MatchTimeRangeSelector",
          "SeasonPatchDatePicker",
          "Selector value vocabulary",
        ],
      },
      { title: "Filters", items: ["Filter namespace"] },
      {
        title: "Match and players",
        items: [
          "MatchHistoryCard",
          "KdaLine",
          "FormDots",
          "PlayerCell",
          "SteamAvatar",
          "ScoreboardTable",
          "SortBySelector",
        ],
      },
      { title: "Graphs", items: ["GraphNodeCard"] },
      { title: "Draft", items: ["DraftSlot"] },
      { title: "Brand and auth", items: ["SteamSignInButton", "BrandIcons and SocialLinks"] },
      { title: "Navigation", items: ["SmartLink", "PrefetchAnchor"] },
      {
        title: "Mini-games",
        items: [
          "AnswerOption",
          "GamePage",
          "GameTile",
          "GameTile and GamePage heading level",
          "TerminalButton",
          "TerminalBadge",
          "Mini-game states",
          "Play a sound",
        ],
      },
    ],
  },
];

export function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const NAV_NAMES: ReadonlySet<string> = new Set(
  NAV.flatMap((chapter) => chapter.groups.flatMap((group) => group.items)),
);
