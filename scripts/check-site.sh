#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  echo "FATAL: $*" >&2
  exit 1
}

test -f .nojekyll || fail ".nojekyll is required for the plain static GitHub Pages site"
test -f RobotTrain_PI_Attempt1.jpg || fail "robot article image is missing"

git diff --check
node --check include_header.js
node --check site-system.js
node --check worker/src/index.js

grep -Fq "const API_BASE = 'https://aarwitz-site-api.aaronhorowits97.workers.dev';" site-system.js ||
  fail "site API origin does not match the canonical Worker"
grep -Fq 'name = "aarwitz-site-api"' worker/wrangler.toml || fail "unexpected Worker name"
grep -Fq 'account_id = "6729a939101c819b5a656b06c3bb0d0b"' worker/wrangler.toml ||
  fail "unexpected Cloudflare account"
grep -Fq 'database_name = "aarwitz-site"' worker/wrangler.toml || fail "unexpected D1 database name"
grep -Fq 'database_id = "dc17752a-51d8-4216-b6bf-593f0c33cc3f"' worker/wrangler.toml ||
  fail "unexpected D1 database id"
grep -Fq 'Dec. 2023 - May 2026' index.html || fail "Cognex end date regressed"
grep -Fq 'From June 2022 through May 2026' about.html || fail "Cognex biography regressed"
grep -Fq 'Co-Founder &amp; Software Engineer' index.html || fail "LIDI current role is missing"
grep -Fq 'Jan. 2025 - Present • Boston, MA' index.html || fail "LIDI role dates regressed"
grep -Fq 'Built a hardware-in-the-loop testing rig pairing oscilloscope capture of encoder pulses and camera triggers with remote on-device debugging and kernel traces, and refactored the test suite to support mute-test-in-code workflows' index.html ||
  fail "Cognex hardware-in-the-loop bullet regressed"
if grep -Fq 'Reduced CI/CD failures by 80%' index.html; then
  fail "unsupported CI/CD percentage is present"
fi
grep -Fq 'href="https://github.com/aarwitz"' index.html || fail "footer GitHub account regressed"
grep -Fq 'RobotTrain_PI_Attempt1.jpg' SockRobotPi0.html || fail "robot article image is not referenced"

python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path

class Parser(HTMLParser):
    def error(self, message):
        raise RuntimeError(message)

files = sorted(Path('.').glob('*.html'))
for path in files:
    parser = Parser(convert_charrefs=True)
    parser.feed(path.read_text(errors='strict'))
    parser.close()
print(f'[check-site] parsed {len(files)} HTML files')
PY

if rg -n 'BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}' \
  --glob '!scripts/check-site.sh' .; then
  fail "possible committed credential detected"
fi

echo "[check-site] OK"
