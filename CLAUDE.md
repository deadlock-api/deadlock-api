## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
pnpx opensrc <package>           # npm package (e.g., npx opensrc zod)
pnpx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
pnpx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
pnpx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```
