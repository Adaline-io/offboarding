# CLAUDE.md — Adaline Offboarding Repo

You're working inside the Adaline Offboarding repository. This file is your operational brief.

## What this repo is

Per-client offboarding forms for **Adaline The Agency** (Myadaline Communications LLP, Calicut). Each subfolder is one client. Each `index.html` is a self-contained single-file HTML form the client fills out at project close — they confirm delivery, share feedback, drop a testimonial, leave well-wishes.

When the client submits, form data POSTs to a Google Apps Script webhook → lands in the "Adaline Offboarding" Google Sheet as a new row + generates a Google Doc + emails a PDF to bettercall@myadaline.com.

The current owner is **Jareer** (CEO). When he opens you in this repo, his goal is usually one of:
1. Push the current state to GitHub
2. Add a new client offboarding (built by Claude in the chat interface, then dropped into this repo)
3. Update content in an existing client's form
4. Debug a form submission that didn't reach the Sheet

## File structure

```
adaline-offboarding/
├── CLAUDE.md                       ← this file
├── README.md                       ← human-facing readme
├── index.html                      ← team-facing client directory
├── .gitignore
├── zahan-trading/
│   └── index.html                  ← live offboarding form (115 KB, self-contained)
└── _build/
    ├── README.md                   ← build system overview
    └── assets/                     ← Adaline brand assets (wordmark, signs)
        ├── wordmark_footer.png
        ├── sign_plus.png
        ├── sign_circle.png
        └── sign_cross.png
```

## Webhook destination

Every offboarding submission POSTs to:
```
https://script.google.com/macros/s/AKfycbwK5-7kD0zWXEX16iCEQtpc012eALdKgU5jtmoCgYu_d_w-MtI5bOfM80NMP6vLR9Ue/exec
```

(Different webhook from the onboarding repo — offboarding routes to its own "Adaline Offboarding" Sheet.)

If a submission doesn't land in the Sheet, the form's fallback chain is:
1. Webhook POST (no-cors mode — silent on success/failure)
2. Opens WhatsApp at +91 90481 91616 with structured message
3. Clipboard backup — entire submission copied as JSON

## Tech stack (constraints — DO NOT BREAK)

- **Single-file static HTML.** Each form is one `index.html` with everything inlined — CSS, JS, base64 brand assets. No external dependencies. Hosted on GitHub Pages.
- **Vanilla JS.** No framework. Forms use native HTML + small submit handler.
- **Build script lives upstream.** The Python build script (`build_offboarding.py`) is maintained by Claude in the chat interface, not in this repo by default. When adding a new client, Jareer asks Claude in chat to regenerate it with new CLIENT data.

## Brand voice & visual system (DO NOT BREAK)

- Dark theme `#0b0b0b` background, `#f5f1ea` ink
- Fonts: Space Grotesk (display) + Inter (body) + JetBrains Mono (utility/code)
- Per-client accent colors (already set, do not change without asking):
  - Zahan Trading: `#e8a93f` (warm saffron-gold — Onam festive register)
- Period-style copy ("Wrap.")
- Gaming language carry-through: HIT START (proposal) → WRAP (offboarding submit)
- "the Management" voice in client-facing copy — never internal team names
- Adaline assets at the close: three signs (+ ○ ×) + wordmark + contact info
- No matched-pair AI sentence structures back-to-back

## Form structure (all client offboardings follow this pattern)

Seven sections in this order:
1. **Cover** — "Wrap." hero with project metadata
2. **Delivery Receipt** — deliverable checklist, client confirms each
3. **The Debrief** — NPS 0-10 + 5-star rating + 4 open-text questions (got_right, could_better, best_moment, biggest_surprise)
4. **The Quote** — testimonial textarea + permissions checkboxes (web/logo/case-study/social-tag)
5. **Pass the Mic** — private well-wishes textarea + optional shoutout
6. **What's Next** — continuation pitch cards (additional engagements, retainers, referral incentive)
7. **Sign-Off** — confirmation checkbox + big WRAP submit button

If a client doesn't have credentials to hand over (e.g. design-only projects like Zahan), the "Your Keys" section is skipped. For website projects (BZ Fitness, Roca Fuel when they close), a credentials handover section is added between sections 4 and 5.

## Git workflow — first push to GitHub

When Jareer asks to push to GitHub for the first time:

```bash
cd /path/to/adaline-offboarding

git init
git add .
git commit -m "Initial commit — Zahan Trading offboarding"

# Create the GitHub repo (requires gh CLI authenticated)
gh repo create adaline-offboarding --public --source=. \
  --description "Per-client offboarding forms for Adaline The Agency" --push

# Enable GitHub Pages
gh api -X POST "repos/{owner}/adaline-offboarding/pages" \
  -f source[branch]=main \
  -f source[path]=/

# Get the live URL
gh api "repos/{owner}/adaline-offboarding/pages" --jq '.html_url'
```

If `gh` CLI is not installed: `brew install gh` (macOS), then `gh auth login`.

Fallback (no gh CLI): create the repo via github.com web UI, then:
```bash
git remote add origin https://github.com/{user}/adaline-offboarding.git
git push -u origin main
```

## Subsequent updates

```bash
git add .
git commit -m "Update {client} — {what changed}"
git push
```

GitHub Pages auto-deploys within ~30 seconds.

## Adding a new client offboarding

The build script isn't in this repo by default — it lives upstream with Claude in the chat interface. To add a new client:

1. **Jareer asks Claude in chat:** "Build the offboarding for {client name}, {project}, total {amount}, delivered {date}, deliverables {list}, accent colour {hex}. Use the reusable template."

2. **Claude generates a new HTML file** same-turn and provides it as a download.

3. **In this repo via Claude Code:**
   ```bash
   mkdir -p {client-slug}
   # Save Claude's HTML output as {client-slug}/index.html
   ```

4. **Update the team directory** (`index.html` at repo root):
   - Find the `.list` div
   - Add a new `<a class="client" href="./{client-slug}/">` block matching Zahan's pattern
   - Use the client's accent colour in the CSS variable

5. **Commit and push:**
   ```bash
   git add . && git commit -m "Add {client} offboarding" && git push
   ```

6. **The live URL** is `https://{github-user}.github.io/adaline-offboarding/{client-slug}/`. Send this to the client at project handover.

## What NOT to do

- Don't change the webhook URL without asking — it's bound to the offboarding Sheet
- Don't change brand accent colours without asking — they're per-client and signed off
- Don't add tracking pixels, analytics, or third-party scripts
- Don't reformat copy unless asked
- Don't add a backend, framework, or build pipeline — stays vanilla / pre-built static
- Don't merge with the onboarding repo — they're intentionally separate for clean separation of submission data

## Quick reference

- **Live forms**: `https://{user}.github.io/adaline-offboarding/{client-slug}/`
- **Webhook**: see top of this file
- **Brand stack**: dark theme, Space Grotesk + Inter + JetBrains Mono, per-client accent
- **Contact**: bettercall@myadaline.com / WhatsApp +91 90481 91616
- **GSTIN**: 32ABYFM6787D1ZN

— Adaline · The Agency
