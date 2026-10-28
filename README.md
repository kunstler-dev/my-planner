# Planner

A black-and-white Windows desktop planner: income & expense tracking (euro or hryvnia), analytics for public
Telegram channels, a Grok (xAI) assistant, today's tasks — and the pet corner from
[Kitten Planner](https://github.com/kunstler-dev/kitten-planner). The interface is in Russian.
All data stays on the local machine; there is no sync.

## Sections

| Section              | What it does                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**             | Today's tasks (quick add, move to tomorrow), month income/expenses, subscribers and reach at a glance, latest operations.                                                                                                                             |
| **Finance**          | Income/expense records with categories and notes, month switcher, totals vs. previous month, saved share of income, expenses and income by category, 12-month chart, CSV export (Excel-friendly).                                                    |
| **Telegram channels** | Any number of channels with a switcher. Reads the public page `t.me/s/<channel>` (no bot, no API key): subscribers (a snapshot per day, past values can be entered by hand), average reach for 7/30 days, ERR, posts per week, reach of the last posts, best weekday and time to post, top posts. |
| **Grok**             | Two modes: grok.com inside the app with your own subscription (sign in once, the session is kept, no API costs; quick prompts are pasted into its message box), or a streaming chat through the xAI API with your own key (encrypted with Windows DPAPI). Quick prompts send your finance and channel numbers along: finance review, channels review, post ideas, weekly plan. Model is selectable.                          |
| **Settings**         | xAI key and model (list loaded from the API), light/dark theme, pets on/off and black-and-white or coloured, currency (€ or ₴), data folder.                                                                                                           |

## Download

Grab `Planner-<version>-portable.exe` from the [latest release](https://github.com/kunstler-dev/my-planner/releases/latest). It is portable: no installation, just run it. The build is not code-signed, so Windows SmartScreen asks once (_More info → Run anyway_).

## Run from source

```bash
npm install
npm start            # npm run dev opens DevTools
npx electron scripts/make-icons.js   # build/icon.svg → icon.png + icon.ico
npm test             # unit tests: finance math, channel parser, data migration, Grok streaming
npm run dist:win     # portable .exe → dist/Planner-<version>-portable.exe
npx electron scripts/screenshots.js shots durov   # demo data + screenshots of every screen
```

Data lives in `%APPDATA%\Planner` (`data.json`, `data.backup.json`, `secret.bin` with the xAI key).

## Stack

Electron (sandboxed renderer, context isolation, strict CSP, one preload bridge), vanilla ES modules,
HTML & CSS without a framework or bundler, three.js for the pets, `node:test`.
