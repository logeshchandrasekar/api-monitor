# Accessibility and responsive checks

## The automated pass

`npm run e2e:a11y` opens every screen in a real browser, in **light and dark**, on a **phone (375 px), a tablet (768 px) and a laptop (1280 px)**:

- axe-core must find **no WCAG 2.0, 2.1 or 2.2 level A or AA** problems: form labels, accessible names, colour contrast, heading and landmark structure, ARIA use, keyboard traps, scrollable areas that cannot be reached by keyboard.
- The page must **never scroll sideways**.

Screens covered: landing, sign in, register, 404; the empty dashboard, monitor list and incident list of a new account; the dashboard, monitor list (with a tag filter and a sort, and with a search that matches nothing), new monitor form (with tags and a tag error showing), monitor detail, incident list and settings of an account with data; and the delete account dialog.

Two more checks: every control reachable with the Tab key shows a **visible focus ring** (monitor list, monitor form, settings), and with the operating system's "reduce motion" setting on, **nothing animates or transitions for more than a blink**.

It takes about 6 minutes. For a quick look at one screen, run a single test: `npx playwright test --config e2e/playwright.config.ts accessibility -g "laptop, light"`.

## What the Phase 9 pass found and fixed

- The recent-checks table on a phone scrolls sideways inside its card, but a keyboard user could not reach it (axe `scrollable-region-focusable`). It is now a labelled, focusable region (`ChecksTable.tsx`).
- Everything else already passed: the Phase 8.5 rework had done the labels, contrast in both themes, focus ring (`:focus-visible` in `index.css`) and the `prefers-reduced-motion` rule.
- New in Phase 9, built accessible from the start: the search box and filters (a `search` landmark, labelled fields, a live "N monitors match" status), the tags field (a labelled list of chips, each with a remove button named "Remove tag x", and the error announced under the field) and the delete account dialog (named and described, focus moves to the password field).

## What automation cannot judge: do this by eye before a release

- [ ] Use the app with the keyboard only for one full journey: sign in, add a monitor, filter the list, open it, pause it. Is the order of the Tab key sensible? Can you always see where you are?
- [ ] Zoom the browser to 200 %. Does anything overlap or get cut off?
- [ ] Turn on a screen reader (NVDA on Windows, VoiceOver on Mac) and listen to the monitor list: does each row make sense read aloud ("Production API, GET https://..., Healthy")?
- [ ] On a real phone, can you reach every control with a thumb, and are the tap targets big enough?
- [ ] Read the colours as a person with colour blindness would: every status also has a written label, never only a colour.
