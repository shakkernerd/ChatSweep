# Privacy Policy

`ChatSweep` runs locally in your browser.

It is an unofficial browser extension and is not affiliated with or endorsed by OpenAI.

## What the extension does

- Displays a floating cleanup panel on `chatgpt.com`
- Loads your conversation list from ChatGPT's own backend endpoints
- Sends delete requests only when you explicitly trigger them
- Stores a small local preference for whether the UI is enabled

## Data collection

`ChatSweep` does not collect, store, sell, or transmit your data to any external server controlled by this project.
To work inside your logged-in ChatGPT session, it temporarily uses ChatGPT page request headers and conversation metadata already available in the active tab to issue ChatGPT delete requests, and does not retain them outside the current page session.

## Network access

The extension communicates only with ChatGPT pages you already have open in your browser session.
It uses the current logged-in tab and ChatGPT's own backend endpoints to load and hide conversations.

## Local storage

The extension uses `chrome.storage.local` only for a simple enabled or disabled preference.

## Analytics

`ChatSweep` does not include analytics, ads, tracking pixels, or third-party telemetry.

## Changes

If this policy changes in a future release, the updated version will be published in this repository.
