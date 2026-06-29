# Confidentiality architecture

This document describes how to keep Digital Twins documentation out of public
access. Read this before changing repository visibility or deployment settings.

## Threat model

| Asset | Risk if public | Current protection |
|---|---|---|
| **Live website** (GitHub Pages) | Anyone with URL can read docs | StatiCrypt password gate on every HTML page |
| **GitHub source** (`*.md` in repo) | Anyone can clone and read cleartext | **None** — repo is public today |
| **CI secrets** (`STATICRYPT_PASSWORD`) | Password leak enables site decrypt | GitHub encrypted secrets (not in repo) |
| **Search engines** | Site indexed, snippets in Google | `noindex` meta on built pages |

**StatiCrypt alone does not protect the GitHub repository.** It only protects
the deployed HTML. If the repo stays public, all markdown remains readable at:

`https://github.com/miles-zhongyi/digital-twins-docs`

## Recommended layered model

```
Layer 1 — Private GitHub repository     → hides source markdown from the public
Layer 2 — StatiCrypt on built HTML      → password gate on the live site (already enabled)
Layer 3 — Strong site password          → STATICRYPT_PASSWORD secret, rotate periodically
Layer 4 — Access control (optional)   → Cloudflare Access, VPN, or IP allowlist in front of Pages
```

### Layer 1: Make the repository private

```powershell
gh repo edit miles-zhongyi/digital-twins-docs --visibility private --accept-visibility-change-consequences
```

Add only trusted collaborators under **Settings → Collaborators**.

**Important — GitHub Pages on private repos:**

| GitHub plan | Private repo | GitHub Pages from private repo |
|---|---|---|
| **Free** | Yes | **No** — Pages only works from public repos |
| **Pro** ($4/mo) | Yes | **Yes** |

If you are on **GitHub Free** and make the repo private, the current Pages
deploy workflow will stop working until you either:

- Upgrade to [GitHub Pro](https://github.com/settings/billing/plans), or
- Move hosting to a private alternative (see below)

### Layer 2: StatiCrypt (already implemented)

CI encrypts every built HTML file before upload to Pages. Only the password
prompt is visible without `STATICRYPT_PASSWORD`.

Configured in `.github/workflows/deploy.yml` and `password_template.html`.

### Layer 3: Password hygiene

- Store password only in **GitHub Actions secret** `STATICRYPT_PASSWORD`
- Use a long random password (20+ characters)
- Rotate after team changes; re-deploy to invalidate old remember-me cookies
- Do not commit the password to git or share in chat

### Layer 4 (optional): Front-door access control

For stronger assurance than a shared password:

- **Cloudflare Pages + Cloudflare Access** — SSO/email gate before the site loads
- **Self-hosted nginx** — basic auth or mTLS behind a VPN
- **Private network only** — serve `_build/encrypted/html` on an internal server

## Migration checklist

### Path A — Full confidentiality (recommended if budget allows)

1. Upgrade to GitHub Pro (if not already on a paid plan)
2. Make repository private (`gh repo edit ... --visibility private`)
3. Confirm `STATICRYPT_PASSWORD` is set under **Settings → Secrets → Actions**
4. Restrict repo collaborators to the team
5. Push to `main` — CI builds encrypted site and deploys to Pages
6. Verify: anonymous browser cannot read `raw.githubusercontent.com/.../*.md`
7. Verify: live site shows password page only until decrypted

### Path B — Free tier compromise

Keep repo **public** (source visible) but:

- StatiCrypt protects the **website** only
- Treat markdown in git as non-confidential
- Use `noindex` to reduce search-engine exposure (enabled in `_config.yml`)

### Path C — Private repo without GitHub Pro

1. Make repository private
2. Disable GitHub Pages deploy workflow
3. Download encrypted artifact from Actions manually, or serve internally:

```powershell
# After local build + staticrypt:
cd TwinsDocumentation\_build
npx staticrypt html -r -d encrypted -c ..\.staticrypt.json -t ..\password_template.html
# Serve _build/encrypted/html on an internal HTTP server
```

## What this project already enforces in CI

- Build runs `staticrypt` on all HTML before Pages upload
- Deploy fails if `STATICRYPT_PASSWORD` secret is missing (encrypt step errors)
- `robots.txt` disallows all crawlers on the built site
- HTML pages include `noindex, nofollow` meta tags

## Verify confidentiality after changes

```powershell
# Source should 404 or require auth (private repo):
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/miles-zhongyi/digital-twins-docs/main/intro.md" -UseBasicParsing

# Live site should show StatiCrypt gate, not cleartext body:
Invoke-WebRequest -Uri "https://miles-zhongyi.github.io/digital-twins-docs/intro.html" -UseBasicParsing
```

## Contact / ownership

Repository: `miles-zhongyi/digital-twins-docs`  
Deployment: GitHub Actions → GitHub Pages  
Password secret: `STATICRYPT_PASSWORD` (GitHub Actions secrets)
