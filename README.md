# miguelpadin.github.io

Personal portfolio — [miguelpadin.github.io](https://miguelpadin.github.io/)

## Stack

- [Astro](https://astro.build) v6 + TypeScript
- Tailwind CSS v4
- Multi-language: EN / ES / GL
- Deployed via GitHub Actions → GitHub Pages on release publish

## Release flow

1. Conventional commits land on `main` via PR
2. release-please opens a version-bump PR (`chore(main): release X.Y.Z`)
3. Merging that PR publishes the GitHub Release, which triggers the Pages deploy

> Releases are created with a PAT (`RELEASE_PLEASE_TOKEN`): releases created
> with the built-in token do not emit the `release:published` event, so the
> deploy would never fire.


## Dev

```sh
pnpm install
pnpm dev          # localhost:4321
pnpm build        # build to ./dist
pnpm preview      # preview build locally
```

