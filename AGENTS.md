# Aaron Horowitz portfolio repository policy

These instructions apply to the entire repository.

## Canonical production architecture

- `https://aarwitz.github.io` is a GitHub Pages site built from the root of
  `main` in `aarwitz/aarwitz.github.io`.
- This portfolio is not a Cloudflare Pages project. Never use the LIDI
  Solutions deployment wrapper or `wrangler pages deploy` for this repository.
- Dynamic accounts, comments, and posts use the separate Cloudflare Worker
  `aarwitz-site-api` at
  `https://aarwitz-site-api.aaronhorowits97.workers.dev`.
- The Worker uses D1 database `aarwitz-site`
  (`dc17752a-51d8-4216-b6bf-593f0c33cc3f`) in Cloudflare account
  `6729a939101c819b5a656b06c3bb0d0b`.
- `lidisolutions.ai` is a different repository and a different Cloudflare Pages
  deployment. Do not reuse its project name, deployment command, or origin.

## Production workflow

1. Keep `.nojekyll`; the site is plain static HTML and does not need Jekyll.
2. Run `scripts/check-site.sh`.
3. Commit the intended release on `main` with a clean working tree.
4. Run `scripts/deploy.sh`. It applies the idempotent D1 schema, deploys and
   verifies the Worker first, pushes `main`, waits for GitHub Pages, and verifies
   public content.
5. Do not publish frontend code that points at an API until `/health` on that
   exact API origin succeeds.

Never deploy this site by pushing a generated directory to Cloudflare Pages.
Never change the Worker name, account, D1 binding, Pages branch, or API origin
in only one file; update configuration, documentation, checks, and deployed
infrastructure together.

## Credentials and safety

- Cloudflare authentication comes from Wrangler OAuth or an explicitly supplied
  token; GitHub authentication comes from `gh`/Git.
- Secrets belong in Cloudflare Worker secrets, never in this repository.
- Public signup must not be able to claim or promote the configured admin email.
- Do not expose account email addresses in public comment responses.
- Authentication and comment mutations require rate limits and production tests.
