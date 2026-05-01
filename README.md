# Power Analytics

React/Vite analytics app for electrical power measurement files, deployed as a Cloudflare Worker with static assets.

## Commands

```bash
pnpm install
pnpm run typecheck
pnpm run build:power-analytics
pnpm run deploy:power-analytics
```

For local Worker validation:

```bash
pnpm run dev:power-analytics:worker
```

For a deploy packaging check without publishing:

```bash
pnpm run deploy:power-analytics:dry-run
```

## Deployment

The production Worker is configured in `artifacts/power-analytics/wrangler.toml` and deploys to:

https://power-analytics.w-philipp99.workers.dev

Local deploys use Wrangler OAuth:

```bash
pnpm --filter @workspace/power-analytics exec wrangler login
pnpm run deploy:power-analytics
```

GitHub Actions deploys automatically from `main` when `CLOUDFLARE_API_TOKEN` is configured as a repository secret. The token needs Workers write access for the Cloudflare account in `wrangler.toml`.
