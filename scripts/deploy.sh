#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ORIGIN="https://aarwitz-site-api.aaronhorowits97.workers.dev"
SITE_ORIGIN="https://aarwitz.github.io"
GITHUB_REPO="aarwitz/aarwitz.github.io"
WRANGLER_CONFIG="$REPO_ROOT/worker/wrangler.toml"

cd "$REPO_ROOT"

fail() {
  echo "FATAL: $*" >&2
  exit 1
}

[[ "$(git branch --show-current)" == "main" ]] || fail "deploys must run from main"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "working tree is dirty"

git fetch --quiet origin main
git merge-base --is-ancestor origin/main HEAD || fail "local main does not contain current origin/main"

"$REPO_ROOT/scripts/check-site.sh"

if [[ -n "${WRANGLER_BIN:-}" ]]; then
  WRANGLER="$WRANGLER_BIN"
elif command -v wrangler >/dev/null 2>&1; then
  WRANGLER="$(command -v wrangler)"
else
  fail "wrangler is unavailable; install it or set WRANGLER_BIN"
fi

echo "[deploy] applying the idempotent D1 schema"
"$WRANGLER" d1 execute aarwitz-site --remote --config "$WRANGLER_CONFIG" \
  --file "$REPO_ROOT/worker/schema.sql"

echo "[deploy] deploying Cloudflare Worker aarwitz-site-api"
"$WRANGLER" deploy --config "$WRANGLER_CONFIG"

health="$(curl --fail --silent --show-error --max-time 20 \
  -H 'Origin: https://aarwitz.github.io' "$API_ORIGIN/health")" ||
  fail "Worker health check failed"
[[ "$(jq -r '.ok // false' <<<"$health")" == "true" ]] || fail "Worker health response is malformed"

echo "[deploy] pushing GitHub Pages source"
git push origin HEAD:main
sha="$(git rev-parse HEAD)"

pages_status=""
pages_commit=""
for attempt in $(seq 1 36); do
  pages_commit="$(gh api "repos/$GITHUB_REPO/pages/builds/latest" --jq '.commit')"
  pages_status="$(gh api "repos/$GITHUB_REPO/pages/builds/latest" --jq '.status')"
  echo "[deploy] Pages attempt $attempt/36: commit=$pages_commit status=$pages_status"
  if [[ "$pages_commit" == "$sha" && "$pages_status" == "built" ]]; then
    break
  fi
  [[ "$pages_commit" != "$sha" || "$pages_status" != "errored" ]] || fail "GitHub Pages build failed"
  sleep 5
done
[[ "$pages_commit" == "$sha" && "$pages_status" == "built" ]] || fail "GitHub Pages did not publish $sha"

cache_bust="?release=$sha"
live_home="$(curl --fail --silent --show-error --max-time 20 "$SITE_ORIGIN/$cache_bust")"
live_about="$(curl --fail --silent --show-error --max-time 20 "$SITE_ORIGIN/about.html$cache_bust")"
live_article="$(curl --fail --silent --show-error --max-time 20 "$SITE_ORIGIN/SockRobotPi0.html$cache_bust")"

grep -Fq 'Dec. 2023 - May 2026' <<<"$live_home" || fail "live homepage has the wrong Cognex end date"
grep -Fq 'Co-Founder &amp; Software Engineer' <<<"$live_home" || fail "live homepage is missing the LIDI role"
grep -Fq 'Built a hardware-in-the-loop testing rig pairing oscilloscope capture of encoder pulses and camera triggers with remote on-device debugging and kernel traces, and refactored the test suite to support mute-test-in-code workflows' <<<"$live_home" ||
  fail "live homepage has stale Cognex testing copy"
if grep -Fq 'Reduced CI/CD failures by 80%' <<<"$live_home"; then
  fail "live homepage contains the unsupported CI/CD percentage"
fi
grep -Fq 'href="https://github.com/aarwitz"' <<<"$live_home" || fail "live footer has the wrong GitHub account"
grep -Fq 'From June 2022 through May 2026' <<<"$live_about" || fail "live About page has stale Cognex copy"
grep -Fq 'Video coming soon.' <<<"$live_article" || fail "live robot article is stale"
curl --fail --silent --show-error --output /dev/null --max-time 20 \
  "$SITE_ORIGIN/RobotTrain_PI_Attempt1.jpg$cache_bust"

echo "[deploy] OK — Worker healthy and GitHub Pages serves $sha"
