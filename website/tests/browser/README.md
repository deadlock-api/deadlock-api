# Tracker browser checks

Install the test browser once, then run the suite:

```sh
pnpm exec playwright install chromium
pnpm test:tracker:browser
```

Playwright starts a dedicated Vite server on port 4318 and a synthetic API on
port 4319, then stops both after the run. Keep these ports free. The usual
development server on port 3000 can stay running.

Fixtures cover both server-rendered loader requests and client requests.
Optional external browser requests are blocked, and each test has isolated
browser storage. No live account, API data, or credentials are needed. These
checks exercise the development tracker; production patron gating needs its
own production-runtime smoke check.

Run a focused check with `pnpm test:tracker:browser --grep preload`.
Failed checks keep a screenshot and Playwright trace under the ignored
`test-results/` directory. Open a trace with `pnpm exec playwright show-trace`
followed by its `trace.zip` path.

The faster calculation and storage checks remain available through
`pnpm test:tracker`.
