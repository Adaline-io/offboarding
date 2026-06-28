# Adaline Offboarding

Per-client offboarding forms. One folder per client. Each becomes a URL the team sends to the client at project close.

## Live URLs (after GitHub Pages enabled)

- Team index: `https://[username].github.io/adaline-offboarding/`
- Zahan Trading: `https://[username].github.io/adaline-offboarding/zahan-trading/`

## Structure

```
adaline-offboarding/
├── README.md
├── CLAUDE.md               ← operational brief for Claude Code
├── index.html              ← team-facing directory page
├── zahan-trading/
│   └── index.html          ← client offboarding form
└── _build/
    ├── README.md
    └── assets/             ← Adaline brand assets (used when adding new clients)
```

## Adding a new client

1. Ask Claude (in the chat interface) to build the offboarding HTML with the new client's data — name, project, total paid, delivery date, deliverables list, accent colour
2. Save Claude's output as `client-slug/index.html` in this repo
3. Add a link block to the root `index.html`
4. Commit + push — GitHub Pages auto-deploys within ~30 seconds

## Forms data destination

Every offboarding submission lands in:

1. **Google Sheet** — `Adaline Offboarding` Sheet, new row in the `Offboarding` tab (auto-created on first submission)
2. **Google Drive folder** — `Adaline Client Submissions` (PDF + Doc archive)
3. **Email** — PDF lands in `bettercall@myadaline.com` with subject `[Adaline Offboarding] Client — Project`

If the webhook fails, forms fall back to WhatsApp with the structured submission to +91 90481 91616.

## GitHub Pages setup

After uploading files:
1. Repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** → folder: **/ (root)**
4. Save → wait ~30 seconds → live URL appears

— Adaline · The Agency
