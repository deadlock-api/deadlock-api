# Deadlock API

Monorepo for the main game data Rust API and website of https://deadlock-api.com

```
api/ # rust api, served in production at https://api.deadlock-api.com
website/ # tanstack start website, using generated openapi SDKs hitting the api
```

## Website UI: strict laws

Any change that touches UI under `website/` is bound by **The 20 Laws of React Design Systems** in
`website/CLAUDE.md` (canonical copy: `website/docs/design-system-laws.md`). They are strict laws, not guidelines:
read them before touching `website/src`, pass them on to every subagent you start, and never work around one.
