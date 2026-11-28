# Brief: the watch list, redesigned whole

## The owner's words
"can you redesign the entire watch list with our concept and make a testing run with vesela and fix everything you find there." (by voice, task 202's side chat, 28 November 2026)
The request names every part: Tonight, Add a title, Up next / Watched / All, the title page, the 1 to 10 rating pad, lists, tags, Share a list, People and invites, the shared view the other person sees. Desktop and phone, dark and light.
"Our concept" is the design standard of task 169 (v2-full, one direction): journeys first, simplicity, one headline sentence then summary then detail, one primary press per view, one accent, both themes, 44 px targets, 390 px with no sideways scroll.

## What this is
The Watch list screen in Rouh (/watch, one title at /watch/<number>) and the page a person a list is shared with opens (/shared/<token>). Built over three steps, each adding a layer (shared lists, rewatching, lists of one's own, tags, ratings out of 10); now redesigned as one.

## Who comes, how often
The owner, a few evenings a week, on a phone on the sofa or at a desk; the person he shares a list with, on a phone, from a link.

## Journeys
In journeys.md, eight. Most frequent: Tonight, and Seen then rate.

## Freedom
Free: the page structure, where lists, New list and Share sit, how filters are shown, the title page's order, the look. Not free: the data, its names, the decisions below.

## Must keep
- Tonight: the show in progress with its next episode, else the first of Up next, within the time they have (Any length, 30 min, 1 hour, 2 hours); Something else; After that.
- Add a title with live matches (poster, year, kind, cast); by name only when nothing is found; a title already there offers Watch again or Open, never a copy.
- Up next, Watched, All with counts; search (titles, people, notes, tags); Kind, Where, Tag filters; Sort; "Nothing here matches" with Clear; a watched match found from Up next is pointed to.
- A card: poster or a drawn one, title, facts, status, progress, the one quick press (Seen S1 E3 / All watched / Mark watched / Watch again), rating "8/10", Rewatch, tags.
- One title: status (To watch, Watching, Watched), the next press, Watch next, Watch again, watch history with dates, every episode a press with All of season seen / None of it seen, my rating 1 to 10 (large number, hover shows it, Save, Clear, Cancel), tags with suggestions, recommended by, where to watch, notes, seen it before (shared), others' ratings, links (open on its service, where it streams in Bulgaria, trailer, IMDb, Wikipedia), about, edit the details, look it up again, Move to, remove with Undo.
- Lists: All lists, My list, each list with counts; New list (names it, brings titles over, sends nothing); a list of one's own says Only you; Share this list; Rename; Stop sharing keeps the list; Delete this list puts its titles back on My list.
- Share a list: email, name, list name, Add and tick or Only look, titles to bring over, the invite letter only if ticked (starts unticked), the link to copy.
- People and invites: each person joined or invited, Copy link, Remove with Undo, invite another.
- The other person's page: whose list, Tonight together, their own rating and notes, Leave this list; read-only when they may only look.
- Toasts with Undo; Rate it after Watched; Escape closes the sheet, then the title, then Add.
- Every count from the one list the server sends.

## Style
Rouh's own tokens and controls (dark), with a light set for the light theme; the posters carry the colour, the chrome stays quiet; one accent (Rouh's blue) for the one main press of each view and for what is selected. System fonts (the page loads nothing). Touch targets 44 px. No left-border cards, gradient washes or emoji.

## Inputs, real counts
The owner's list today: 3 titles on My list (Ancient Apocalypse, The Maze Runner, The Century of the Self), all to watch, none rated, no tags, no other lists, nobody invited. Expected in a year: 50 to 200 titles, 2 to 5 lists, 5 to 20 tags, a few rewatches. The prototype uses made-up titles at that scale (10 titles, 3 lists).

## Settled words
Watch list, Tonight, After that, Something else, Any length, Add a title, Up next, Watched, All, My list, All lists, New list, Make the list, Share this list, Share a list, People and invites, Only you, Stop sharing, Delete this list, Leave this list, Seen S2 E4, Watched it, All watched, Mark watched, Watch again, Watch next, Rewatch, Watched 2 times, My rating, Save, Clear, Cancel, Tags, Recommended by, Where to watch, Notes, Move to, Look it up again, Edit the details, Remove from the list, Undo, Rate it, Filter, Sort.

After Vesela's run (trial 66): Watch next is said "Put first in Up next", and a show's next press says the episode in words ("Seen season 2, episode 4"); cards keep "Seen S2 E4".
