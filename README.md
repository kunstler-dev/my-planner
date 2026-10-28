# Planner

A black-and-white Windows desktop planner for money, job search, side projects and Telegram channels, with a Grok
assistant and the pet corner from [Kitten Planner](https://github.com/kunstler-dev/kitten-planner). The interface is in
Russian. All data stays on the local machine; there is no sync.

## Sections

| Section                 | What it does |
| ----------------------- | ------------ |
| **Home**                | Total money, month result, subscribers, applications this week; today's tasks and habits, latest operations, payments due this week, budget warnings, earned game time, channel reach. |
| **Finance**             | Operations (income/expenses with categories, project link, month overview, 12-month chart, CSV export), **budgets** per category, **recurring payments** that are written automatically on their day, **savings goals** with the monthly amount needed. Currency: € or ₴. |
| **Accounts**            | Where the money is: Trust Wallet (crypto, in $/USDT), Ukrainian card (₴), German card (€) and any other. Balances are typed in; the total is converted with official NBU rates (or rates typed by hand) and tracked over time. |
| **Career**              | Ausbildung / job applications as a compact list: quick add in one line, status changed right in the row (want to send → sent → interview → offer / rejected), filters, weekly goal, follow-up reminders a week after sending, Bewerbung documents checklist, job boards, Grok helpers for the Anschreiben, follow-up e-mails and interview practice. |
| **Projects**            | Own apps and projects: income and expenses linked from Finance, hours spent, profit per hour, milestones, Grok monetization ideas. |
| **Telegram channels**   | Any number of public channels: analytics from `t.me/s/<channel>` (subscribers, reach, ERR, best time to post, top posts), a **content plan** (week strip, ideas, published, drafts with Grok) and **ads** (bought and sold posts, cost per subscriber, optional finance entries). |
| **Tasks & habits**      | Tasks by date (overdue, today, tomorrow, later) and daily habits with streaks. |
| **Notes**               | Quick notes with search and pinning. |
| **Games**               | **Steam wishlist** (search the store or paste a link; hryvnia prices from the Ukrainian store checked daily, discounts, lowest price seen, target price), **ranks** (Dota 2 MMR with the approximate medal, FACEIT ELO and level, Deadlock rank up to Eternus — history, goals, notes after games, Grok finds repeated mistakes), **content** (game clips from idea to published, views on TikTok / Shorts / YouTube, Grok scripts and ideas). |
| **Grok**                | Three modes: grok.com inside the app with your own subscription (sign in once, the session is kept, no API costs; quick prompts with your numbers are pasted into its message box), grok.com in your own browser (for Google sign-in, which embedded windows block; prompts open prefilled via ?q=), or a streaming chat through the xAI API with your own key (encrypted with Windows DPAPI). |
| **Settings**            | Grok mode, key and model, light/dark theme, your own background picture (with a dimming slider) and banner video/GIF behind the logo — stored in the data folder, never in the repo, pets on/off and black-and-white or coloured, currency, data folder. |

## Download

Grab `Planner-<version>-portable.exe` from the [latest release](https://github.com/kunstler-dev/my-planner/releases/latest). It is portable: no installation, just run it. The build is not code-signed, so Windows SmartScreen asks once (_More info → Run anyway_).

## Run from source

```bash
npm install
npm start            # npm run dev opens DevTools
npx electron scripts/make-icons.js   # build/icon.svg → icon.png + icon.ico
npm test             # unit tests: finance math, channel parser, accounts, recurring payments, budgets, goals, habits, career, ads, projects, Steam prices, ranks, clips, data migration, Grok streaming
npm run dist:win     # portable .exe → dist/Planner-<version>-portable.exe
npx electron scripts/screenshots.js shots durov   # demo data + screenshots of every screen
```

Data lives in `%APPDATA%\Planner` (`data.json`, `data.backup.json`, `secret.bin` with the xAI key, `media/` with the background and banner).

## Stack

Electron (sandboxed renderer, context isolation, strict CSP, one preload bridge), vanilla ES modules,
HTML & CSS without a framework or bundler, three.js for the pets, `node:test`.
