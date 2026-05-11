# Storely website

The Storely documentation site, built with [Astro 4](https://astro.build) and
[Pagefind](https://pagefind.app).

## Develop

```sh
pnpm install
pnpm website:serve
```

Astro boots at <http://localhost:4321>. The dev command runs the
`sync-adapter-docs` step first so every package README in the monorepo is
mirrored into `src/content/`.

## Build

```sh
pnpm website:build
```

Produces a static `dist/` directory ready to upload to any static host. The
`pagefind` step runs at the end to build the client-side search index inside
`dist/pagefind/`.

## Structure

```
src/
├── content/        Markdown + collection schemas (docs, adapters, guides)
├── components/     Editorial primitives (Hero, AdapterGrid, …)
├── layouts/        BaseLayout, MarketingLayout, DocsLayout
├── pages/          Astro routes
├── scripts/        sync-adapter-docs.ts (README → MDX importer)
└── styles/         tokens.css, reset.css, prose.css, shiki.css
```

## Design

- Typography: **Instrument Serif** for display, **Geist Sans** for body,
  **Geist Mono** for code.
- Palette: warm cream canvas, deep oxblood accent, ochre marker.
- No Tailwind. Scoped CSS in `.astro` components with shared tokens.

See [the design tokens](src/styles/tokens.css) for the source of truth.
