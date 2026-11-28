# Handoff: the watch list, redesigned whole (direction "a-evening", step 202-05)

Built straight into `rouh/static/watchlistpage.js` and `.css` (the prototype is the real script over `mock.js`, made-up titles and people only); the shared page's bar in `rouh/templates/rouh/watch_shared.html`.

## Journeys and targets
The eight in `../journeys.md`. Most frequent: Tonight (answer 0 presses, act 1 press) and Seen then rate (1, then 3 from the toast).

## Navigation
One page. Head (sentence, Add a title shaped as its box) -> lists strip (All lists, My list, each list, New list beside it; Share a list on the strip when All lists is shown) -> who sees the list -> Tonight -> shelf (Up next / Watched / All, search, Filter with chips) -> posters. A title: a panel beside the list on a desk, the whole layer on a phone. Sheets: New list, Share a list, People and invites.

## Old -> new
- Add a title, New list, Share a list as three equal top buttons -> Add a title in the head; New list beside the strip; Share a list on the strip (All lists) or the "who sees it" line.
- List pills that wrapped -> one row that scrolls inside itself, fading at the side that has more.
- Four labelled dropdowns -> Filter: Kind, Where, Tag and Sort as one-press choices; chips with a cross for each one on.
- A card's two presses (Seen and All watched) -> one; all watched is the title page's Status.
- Title page in one long column -> the next press with Where to watch / Open <service> and Watch next first, then Status, Seasons, My rating, Tags, Notes, Links, About it, More (Move to, edit, look up again, remove).
- Tonight's After that: on a phone it goes (Up next, just below, is the same order).

## Data the backend supplies
Unchanged: `/api/watch` and the shared `/shared/<token>/watch/api/watch`, the same fields. No migration.

## Tokens
Dark: Rouh's own (`app.css`): bg #0a0c10, bg-2 #0e1116, panel #12161c, panel-2 #171c24, line #232a34, line-soft #1b2129, text #e7ecf3, dim #8d9aac, accent #5ec2ff on ink #04121c, bad #ff7a70, focus #ffd76a.
Light (the layer's own, under `prefers-color-scheme: light`, or `data-theme="light"` on `.wl-view`): bg #f5f6f8, bg-2 #eceef2, panel #ffffff, panel-2 #f0f2f5, line #cfd5dd, line-soft #e2e6eb, text #12161c, dim #4b5664, dimmer #5c6876, accent #0a64a4 on white, bad #b3261e, focus #7a5200.
Type 12, 13, 14, 16, 20, 28 px (rating number 44); spacing in 4 px; radius 10 (controls), 12 (inputs), 16 (panels), pills round.

## Dropped
Nothing of the must-keep list. The second press on cards (All watched) moved to the title page.

## Open
Rouh as a whole has no light theme; the watch list's layer has its own, so in light mode it is a light layer inside Rouh's dark frame.
