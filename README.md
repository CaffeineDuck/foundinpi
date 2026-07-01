# Found in Pi

[foundinpi.com](https://foundinpi.com) is an image archaeology toy. Drop in an
image and it excavates a finite indexed dig site inside pi, then turns the
result into a shareable relic with a score, rarity tier, heatmap, and public
museum page.

It was inspired by PiFS and the old free-data internet joke: if every file is
somewhere in pi, can you store anything for free? Found in Pi keeps the joke,
but drops the false storage claim. It does not search all of pi. It searches a
defined dig site and tells you exactly what it searched.

## What It Does

- Reconstructs uploaded images client-side with Canvas and a Web Worker.
- Matches image tiles against a packed index of pi-derived fragments.
- Labels each tile as `Exact Pi`, `Near Pi`, `Lossy Pi`, or `Earth Bytes`.
- Generates a deterministic relic name, score, rarity, and share grid.
- Publishes public relic pages with Open Graph metadata.
- Ranks museum artifacts by sampled views and score.
- Includes `/random` for a random public relic.

## Honesty Contract

Found in Pi is playful, not fake science.

- It does not search all digits of pi.
- It does not compress files into pi.
- It searches a finite indexed region: **Dig Site I**.
- Scores are excavation scores under this app's algorithm.
- Original pixels are used for matching only; the relic image is rendered from
  pi-derived fragments and reconstruction classes.

The current dig site is `pi32-1m-v1`:

- First `1,000,000` decimal digits of pi.
- Overlapping `32`-digit visual fragments.
- `7`-digit stride.
- `142,853` indexed fragments.
- Packed index: `public/dig-sites/pi32-1m-v1.bin`.
- SHA-256: `555ee7260f240b7a6808aafcaac31d1ace809b3d8e55da4245f6a92c3974fe66`.

## Stack

- [Astro](https://astro.build/) for SEO-visible pages and Cloudflare output.
- [React](https://react.dev/) islands for the excavation app.
- TypeScript across client, Worker, and server routes.
- Canvas plus a browser Web Worker for image reconstruction.
- Cloudflare Workers Static Assets for hosting.
- Cloudflare D1 for relic metadata and ranking.
- Cloudflare R2 for generated relic/card images.

## Local Development

```sh
npm install
npm run dev
```

The local dev server uses Cloudflare's local bindings when available. If the
bindings are absent, the app falls back to in-memory storage for published
relics.

Useful commands:

```sh
npm run build
npm run digsite:build
npm run cf:d1:migrate:local
```

## Cloudflare Setup

Create the production resources:

```sh
npm run cf:d1:create
npm run cf:r2:create
npm run cf:d1:migrate:remote
```

Then deploy:

```sh
npm run deploy
```

For GitHub Actions, set these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow in `.github/workflows/deploy.yml` deploys on pushes to `main`.

## Repository Notes

The Cloudflare token belongs in `.env.cloudflare` for local use or in GitHub
Actions secrets for CI. Do not commit tokens, local D1 state, build output, or
generated dependency folders.

## License

MIT
