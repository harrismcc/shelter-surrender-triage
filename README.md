# Shelter Surrender Triage

Decision support for animal shelter surrender-request triage, built as a Cloudflare Worker. See [PRD.md](./PRD.md) for the product requirements.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```

The Worker is available at `http://localhost:8787` by default. Its health endpoint is `GET /health`.

To generate Cloudflare types, verify the project, or build a deployment bundle:

```bash
bun run cf-typegen
bun run typecheck
bun test
bun run build
```

To deploy after authenticating Wrangler with Cloudflare:

```bash
bun run deploy
```
