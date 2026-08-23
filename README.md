# Aaron Horowitz portfolio

Static portfolio pages for [aarwitz.github.io](https://aarwitz.github.io), plus
the source for the small API that powers accounts, comments, and server-backed
posts.

## Production map

| Concern | Canonical target |
| --- | --- |
| Public website | GitHub Pages: `https://aarwitz.github.io` |
| Pages source | Repository `aarwitz/aarwitz.github.io`, branch `main`, path `/` |
| Site API | Cloudflare Worker `aarwitz-site-api` |
| API origin | `https://aarwitz-site-api.aaronhorowits97.workers.dev` |
| Database | Cloudflare D1 `aarwitz-site` |
| Worker config | `worker/wrangler.toml` |
| D1 schema | `worker/schema.sql` |
| Release command | `scripts/deploy.sh` |

Cloudflare Pages is not used for this repository. `lidisolutions.ai` is a
separate Cloudflare Pages project with its own repository and deployment
wrapper.

## Validate and deploy

```bash
scripts/check-site.sh
scripts/deploy.sh
```

The deploy script deliberately publishes the Worker before pushing `main`, so
new frontend code cannot reach GitHub Pages while its API is absent. It then
waits for the GitHub Pages build for the exact Git commit and verifies the live
portfolio, article asset, API health, and employment-date correction.

Requirements:

- a clean local `main` whose history contains the current `origin/main`;
- authenticated `git` and `gh` access to `aarwitz/aarwitz.github.io`;
- Wrangler authenticated to Cloudflare account
  `6729a939101c819b5a656b06c3bb0d0b` with Workers and D1 write access;
- `WRANGLER_BIN` set if `wrangler` is not on `PATH`.

The schema application is idempotent. Worker secrets, including any bootstrap
admin credential, must be stored through Cloudflare and must never be committed.
