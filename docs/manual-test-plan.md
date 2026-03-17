# Manual Test Plan

## Scope

This plan covers the ChatSweep MVP described in `README.md`.
It focuses on the content-script flow that injects a floating control panel, opens an API-backed chooser modal with pagination, and deletes selected chats through ChatGPT's backend conversation API.

## Test Environment

- Chrome desktop browser
- A ChatGPT account with multiple conversations
- At least one conversation that can be safely deleted
- A clean browser profile or a profile without conflicting extensions, if possible

## Preconditions

1. Load the extension unpacked from this repository.
2. Sign in to ChatGPT in the browser.
3. Open ChatGPT while signed in.

## Test Cases

### 1. Extension Loads on ChatGPT

- Open `chatgpt.com` after loading the unpacked extension.
- Confirm the floating `ChatSweep` panel appears.
- Confirm the panel does not appear on unrelated sites.

Pass criteria:

- The panel is visible on ChatGPT.
- No extension UI is injected on non-ChatGPT pages.

### 2. Chooser Loads Chats From API

- Load a ChatGPT page while signed in.
- Click `Choose chats`.
- Confirm the modal opens and loads a page of conversations.

Pass criteria:

- The chooser modal opens without slowing down the page.
- Conversations appear once each in the list.
- The page label and count metadata render correctly.

### 3. Select Individual Chats

- In the chooser modal, select a few chats manually.
- Observe the selection count in the floating panel.

Pass criteria:

- Only the chats you picked become selected.
- The count updates to match the number of selected chats.

### 4. Pagination

- In the chooser modal, click `Next`.
- Confirm a new page of chats loads.
- Click `Previous` to return.

Pass criteria:

- Pagination requests succeed.
- The list updates for the new offset.
- Previously selected chats remain selected across page changes.

### 5. Clear Selection

- After selecting one or more chats, click `Clear`.
- Observe the selection count and chooser state.

Pass criteria:

- All selections are removed.
- The count returns to zero.

### 6. Delete Selected Happy Path

- Select one or more chats.
- Click `Delete selected`.
- Confirm the browser prompt.

Pass criteria:

- The extension reports progress while deleting.
- Each selected chat no longer appears after the page refreshes or the current page reloads.
- The selection count returns to zero when the operation completes.

### 7. Cancel Delete Confirmation

- Select one or more chats.
- Click `Delete selected`.
- Cancel the browser confirmation prompt.

Pass criteria:

- No chats are deleted.
- The selection remains intact.
- The progress state does not start.

### 8. Empty Selection Guard

- Do not select any chats.
- Click `Delete selected`.

Pass criteria:

- The button is disabled or the operation does nothing.
- No confirmation prompt appears.

### 9. Empty Result Handling

- Test on an account or filter state where no conversations are returned for the current page, if possible.

Pass criteria:

- The panel stays visible.
- The status message indicates that no chats are available.
- No errors are thrown in the page console.

### 10. Partial Failure Handling

- Select multiple chats.
- Trigger a delete flow where one item fails, if possible, by expiring the session, interrupting the request, or otherwise forcing an API error.

Pass criteria:

- The extension continues attempting remaining deletions.
- Failed items are reported in the console or status output.
- The UI remains usable after the operation.

### 11. Reload Resilience

- Select a few chats.
- Reload the ChatGPT page.

Pass criteria:

- The extension panel returns after reload.
- Previously selected state is not incorrectly preserved as selected.
- The chooser can be reopened and loads the first page of chats again.

### 12. Navigation Between Chats

- Open a conversation, then navigate elsewhere within ChatGPT.
- Reopen the chooser.

Pass criteria:

- The chooser still loads from the API.
- Pagination and selection still work after navigation.

### 13. Non-Target Site Safety

- Visit a site other than `chatgpt.com` or `chat.openai.com`.

Pass criteria:

- The extension UI is not injected.
- No console errors are introduced by the content script on unrelated sites.

## Regression Notes

- Re-run the happy path after any ChatGPT backend API change, especially if list or patch payloads change.
- Re-run the non-target site safety check after modifying manifest matches.
- Re-run the reload and navigation checks after changing request, pagination, or selection logic.

## Recommended Recording

For each run, record:

- Browser version
- Extension version
- ChatGPT URL used
- API page offset and limit used
- Whether the patch delete request returned success
- Any console warnings or request failures
