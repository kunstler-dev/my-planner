# Planner

A black-and-white Windows desktop planner for money, job search, side projects and Telegram channels, with a Grok
assistant and the pet corner from [Kitten Planner](https://github.com/kunstler-dev/kitten-planner). The interface is in
Russian, Ukrainian and German (switch it in Settings or at the bottom of the menu, no restart). All data stays on the
local machine; there is no sync. The app lives in the tray, can start with Windows and sends Windows notifications. The layout is compact by default
(a spacious mode is in Settings) and the menu collapses to icons — by its button or by itself in a window under 1100 px.

## Sections

| Section                 | What it does |
| ----------------------- | ------------ |
| **Home**                | Total money, month result, subscribers, applications this week; today's tasks and habits, latest operations, payments due this week, budget warnings, games, channel reach. **Customize** shows, hides and reorders the cards; cards without data hide themselves. |
| **Finance**             | Operations (income/expenses, one line each: date · category · comment · amount, a day header with the total when a day has several; categories, project link, month overview, 12-month chart, CSV export), **budgets** per category, **recurring payments** that are written automatically on their day, **savings goals** with the monthly amount needed. Currency: € or ₴. |
| **Accounts**            | Where the money is: Trust Wallet (crypto, in $/USDT), Ukrainian card (₴), German card (€) and any other. **Trust Wallet** updates itself from public addresses (TRON / TRC-20, BNB Smart Chain / BEP-20, Ethereum / ERC-20: native coin and USDT, prices from CoinGecko; never a seed phrase) with a breakdown by coin and network. **Monobank** (personal token) updates the chosen cards' balances and imports operations into Finance: categories by MCC, your own rules first, repeats dropped, holds updated; currency cards can be separate accounts. Other accounts are typed in. The total is converted with official NBU rates (or rates typed by hand) and tracked over time. |
| **Inbox**               | Imported operations and letters waiting for a decision: transfers (expense / income / skip), incoming money without a rule, bills and receipts from Gmail (amount, date and category found; a bill that matches a bank operation is attached to it), application status letters («Apply» moves the application in Career, or «Create application?»), alerts like «payment failed», letters it couldn't read (open in Gmail). Accept in one click, change category, amount and date first; «always» or a changed category saves a rule. Bills with a due date appear in «Upcoming payments». Monobank jars can drive savings goals. |
| **Career**              | Ausbildung / job applications as a compact list: quick add in one line, status changed right in the row (want to send → sent → interview → offer / rejected), filters, weekly goal, follow-up reminders a week after sending, Bewerbung documents checklist, job boards, Grok helpers for the Anschreiben, follow-up e-mails and interview practice. |
| **Projects**            | Own apps and projects: income and expenses linked from Finance, hours spent, profit per hour, milestones, Grok monetization ideas. |
| **Telegram channels**   | Any number of public channels: analytics from `t.me/s/<channel>` (subscribers, reach, ERR, best time to post, top posts), a **content plan** (week strip, ideas, published, drafts with Grok) and **ads** (bought and sold posts, cost per subscriber, optional finance entries). |
| **Tasks & habits**      | Tasks by date (overdue, today, tomorrow, later) and daily habits with streaks. |
| **Notes**               | Quick notes with search and pinning. |
| **Games**               | **Steam wishlist** (search the store or paste a link; hryvnia prices from the Ukrainian store checked daily, discounts, lowest price seen, target price), **ranks** (Dota 2 MMR with the approximate medal, FACEIT ELO and level, Deadlock rank up to Eternus — history, goals, notes after games, Grok finds repeated mistakes), **content** (game clips from idea to published, views on TikTok / Shorts / YouTube, Grok scripts and ideas). |
| **Grok**                | Three modes: grok.com inside the app with your own subscription (sign in once, the session is kept, no API costs; quick prompts with your numbers are pasted into its message box), grok.com in your own browser (for Google sign-in, which embedded windows block; prompts open prefilled via ?q=), or a streaming chat through the xAI API with your own key (encrypted with Windows DPAPI). |
| **Settings**            | Language (Русский / Українська / Deutsch), close to tray and start with Windows, Grok mode, key and model, light/dark theme, your own background picture (with a dimming slider) and banner video/GIF behind the logo — stored in the data folder, never in the repo, compact or spacious layout, pets on/off and black-and-white or coloured, currency, **notifications** (payments today and tomorrow, budgets at 90 % and over, follow-ups, habits not checked by the evening; quiet hours), **Gmail** (address, app password, check interval, sender rules, optional Grok for unknown letters), data folder and **daily backups** with one-click restore. |

## Automatic accounts

- **Monobank:** get a personal token at [api.monobank.ua](https://api.monobank.ua/), paste it in Settings → Monobank and press «Check». Then in Accounts → ✎ choose «Source: Monobank» and tick the cards. Monobank allows one request a minute, so the first import of the last 31 days takes a few minutes in the background.
- **Gmail:** turn on two-step verification in your Google account, create an app password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), then Settings → Mail: address, app password, «Check now». The mailbox is opened read only — nothing is marked read, moved or deleted; only found amounts, dates, subjects and message IDs are kept.
- **Trust Wallet:** in Accounts → ✎ choose «Source: Trust Wallet» and add your **public** addresses. Never paste the recovery (seed) phrase anywhere.

## Download

Grab `Planner-<version>-portable.exe` from the [latest release](https://github.com/kunstler-dev/my-planner/releases/latest). It is portable: no installation, just run it. The build is not code-signed, so Windows SmartScreen asks once (_More info → Run anyway_).

## Run from source

```bash
npm install
npm start            # npm run dev opens DevTools
npx electron scripts/make-icons.js   # build/icon.svg → icon.png + icon.ico
npm test             # unit tests: finance math, channel parser, accounts, recurring payments, budgets, goals, habits, career, ads, projects, Steam prices, ranks, clips, data migration (v1 → v4), daily backups, wallet parsing and address checks, Monobank queue (60 s) and statement import, MCC categories, rules, inbox, mail parsing (amounts, dates, sender rules, application letters, bank matching, bills, Grok answers, read-only IMAP, MIME and PDF on made-up letters), named secrets, scheduler and notifications, translations (same keys in all three languages, no Cyrillic outside the dictionaries), chart ticks without repeated labels, home card layout, Grok streaming
npm run dist:win     # portable .exe → dist/Planner-<version>-portable.exe
npx electron scripts/screenshots.js shots durov de   # demo data + screenshots of every screen (ru, uk or de)
```

Data lives in `%APPDATA%\Planner` (`data.json`, `data.backup.json`, `backups/` with the last 30 daily copies,
`secret.bin` with the xAI key and `secret-*.bin` for other tokens — all encrypted with Windows DPAPI, `media/` with the
background and banner). Start with Windows runs the app with `--hidden`, straight into the tray.

## Stack

Electron (sandboxed renderer, context isolation, strict CSP, one preload bridge), vanilla ES modules,
HTML & CSS without a framework or bundler, three.js for the pets, imapflow + mailparser + pdf-parse for reading bills from Gmail, `node:test`.
