# Chrome Web Store listing (draft)

Build the upload with `SPARROW_SITE=https://user23052036.github.io/Sparrow/ npm run package --prefix apps/extension` (any https address works, with or without a folder). The packager (`scripts/store-manifest.mjs`) points the content script at that site instead of localhost, makes the extension open that site before the person connects (`lib/site.js`), and ships only the runtime files. `npm run test:extension` covers it. It does not change `permissions`.

## Name and summary

- **Name:** Sparrow: gentle focus
- **Summary (under 132 characters):** Block distracting sites during focus sessions you choose. Part of Sparrow, a gentle daily planner. Partial days count.

## Description

Sparrow helps you plan a few small things each morning and look back kindly each evening. This extension is the part that protects your focus time on this computer.

When you start a focus session in the Sparrow website, the extension blocks the sites you picked until the timer ends. If you want to stop early, it asks you to wait a moment and say what you will do instead. You can lock a session with an accountability partner so only they can end it early. Ending the partnership always releases the lock.

Blocking is friction, not a cage: you can disable the extension at any time. If it goes quiet during a session, Sparrow notes it so you can see your patterns. Nothing here is built to shame you.

## Single purpose (the store asks for this)

Block the websites a signed-in user chose, only while that user has an active focus session in Sparrow.

## Permission justifications

| Permission | Why it is needed |
| --- | --- |
| `declarativeNetRequest` | Applies the block rules for the sites the user chose, without reading page content. |
| `storage` | Keeps the user's own sign-in tokens and the current block list on this device. |
| `alarms` | Wakes the extension to start and end sessions on time and send a heartbeat. |
| `optional_host_permissions: *://*/*` | Nothing is granted at install. When the user's block list has a site the extension may not touch yet, the popup offers to allow it, and Chrome asks for that site only (and its subdomains). With it, a blocked page is replaced by the calm "This can wait" page; without it, the site is still blocked, with the browser's own page. The extension does not read or modify page content; its only content script runs on the Sparrow site itself. |

## Data disclosures

- **Collected:** the account email the user signs in with; the sites the user chose to block; focus session times; a heartbeat that says blocking is on. All of it belongs to the user and is stored in their Sparrow account.
- **Not collected:** browsing history or page content. The extension is given the list of sites to block and does not send back which sites you visit.
- **Not sold, not shared** with third parties, not used for advertising or credit decisions.
- Privacy policy URL: `<your site>/privacy` (the page ships in `apps/web/app/privacy`). Replace the placeholder with the deployed address before submitting.

## Assets to prepare before submitting (not in the repo)

- 128x128 icon: use `apps/extension/icons`.
- At least one 1280x800 screenshot (the Focus page with a running session works well).
- A small 440x280 promotional tile (optional).
- A developer account (one-time registration fee).

## Review risks to expect

- Broad host access was the biggest review risk; since D42 there is none at install, only per-site optional access the user grants from the popup. The flow has unit tests but has not been tried in a real Chrome yet: check that the popup's "Allow" button opens Chrome's prompt and that a granted site then shows the calm page.
- The single-purpose statement above must match the store description and the actual behavior.
