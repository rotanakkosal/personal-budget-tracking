
# Personal Budget Tracker — Next.js (App Router, TypeScript)

This is a faithful conversion of your static HTML into a Next.js 14 app using the App Router and TypeScript. All features are preserved:

- Tabs (Income / Expenses / Summary) with localStorage persistence
- KRW→USD conversion at a fixed rate (1 USD = 1,388 KRW)
- Add / delete rows for income & expenses
- Create custom expense categories
- Category breakdown with percentage bars
- JSON export / import
- Local-only data (no backend)
- Lightweight toast notifications

## Getting Started

```bash
pnpm install   # or npm install / yarn
pnpm dev       # or npm run dev / yarn dev
```

Then open http://localhost:3000.

## Notes

- Styles are placed in `app/globals.css` (copied from the original HTML).
- The page is a client component (`'use client'`) since it uses browser APIs.
- If you want to swap the fixed KRW/USD rate, edit `--rate` in `app/globals.css`.
