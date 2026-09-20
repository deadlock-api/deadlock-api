# The 20 Laws of React Design Systems

These are strict laws for every line of UI in this repository. They are not guidelines, and no task, deadline or
request for a "quick fix" suspends them. If a change cannot satisfy a law, the design system is extended until it
can; the law is never worked around. `docs/design-system.md` describes how this codebase implements them and
`pnpm lint` enforces what a machine can check.

1. **Everything is a token.** No raw color, space, radius, shadow, size, or duration inside a component. Tokens layer primitive → semantic → component, and components consume semantic tokens only.
2. **A theme is a token swap.** Dark mode, brands, and density change CSS custom property values — never a branch in component code.
3. **Scales, not numbers.** Spacing sits on a fixed 4px scale; typography is a named type scale that bundles size, line-height, weight, and tracking.
4. **Layout belongs to the parent.** Components never set outer margins. `Stack` / `Grid` / `Inline` own spacing, and everything is built on `Box` / `Text` / `Stack` so token usage is guaranteed by construction.
5. **One styling strategy, zero runtime.** Works in Server Components and SSR without hydration cost; specificity stays flat, `!important` is banned, styles never leak, and a consumer overrides with one class.
6. **Extend the native element.** Props extend `ComponentProps<'x'>`, unknown props (`aria-*`, `data-*`, form attributes, handlers) forward to the root, every DOM-rendering component forwards its ref, and native form behavior is preserved.
7. **Variants are enums.** `variant="secondary"`, not `isSecondary`; invalid combinations are unrepresentable via discriminated unions.
8. **Zero props must render correctly.** Every prop has a sensible, accessible default.
9. **State ownership is explicit.** Controlled and uncontrolled via `value` / `defaultValue` / `onChange`, never switching between them by accident.
10. **Composition over configuration.** Compound components, children, and slots — not config objects, `renderX` props, or a new prop for every layout.
11. **One vocabulary.** Callbacks are `onX` with one signature system-wide, similar concepts share names, the public API stays small, and `className` is a documented escape hatch, not a design tool.
12. **Behavior is headless.** Logic lives in hooks (`useSelect`, `useDialog`); presentation is a separate layer that can be swapped.
13. **No business logic in shared components.** A button never imports your router or billing service.
14. **Render pure, keep state minimal.** No side effects in render, derive instead of duplicate, Effects only for external synchronization with guaranteed cleanup, IDs from `useId`.
15. **Server-render safe.** No browser-only APIs during render, initial markup matches on hydration, and server/client boundaries are explicit.
16. **AA is the floor.** WCAG 2.2 AA by default; native elements first, ARIA only to fill gaps, and every control has an accessible name with labels, help, and errors connected programmatically.
17. **Full keyboard, visible focus.** Follow WAI-ARIA patterns per widget; focus is always visible via `:focus-visible`; overlays trap focus, close on Escape, and restore it to the trigger.
18. **Perceivable by everyone.** 4.5:1 text / 3:1 UI contrast in every theme, state never conveyed by color alone, targets at least 24×24 px (44 for primary actions), and `prefers-reduced-motion` respected.
19. **Adapt to the user's environment.** `rem` sizing so font preferences are honored, container-aware rather than viewport-aware, logical properties for RTL, and room for longer translations.
20. **Every state is specified and distinct.** Hover, focus, pressed, selected, disabled, loading, read-only, error, empty, overflowing — and loading, disabled, and read-only each define their own focus, interaction, and announcement behavior.
