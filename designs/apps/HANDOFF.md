# Handoff: Apps

The design for every Apps screen, made before the code (28 November 2026), from `journeys.md`. One direction, A. The prototype is `proto.html`, built into one folder per state by `build.py` (made-up names at the real scale). Nothing here is built into Rouh yet: the owner approves the design first. Three critic rounds: 5, 1 and 1 blockers; the last one was fixed and proved by the scripted walk (`loop-log.md`).

## Journeys and targets

| Journey | Target | In the design |
|---|---|---|
| 1. Is everything up? | first line, 0 presses, 3 s | The verdict sentence is line one of the Dashboard at both widths |
| 2. What needs me? | visible without scrolling; the fix 1 press | Needs you under the verdict; each line carries its fixes (Restart, Roll back, Logs, Ask Rouh to fix it, Open; Back up now; Ask for a report); a notice opens the app's own view with Restart first |
| 3. Open or change one app | Open 1 press; change 2 plus typing | The address on every row; the row opens the app; Ask Rouh to change it there |
| 4. Set up my apps server | 3 presses plus the host's steps | Set up an apps server, Make my setup line (Hostinger picked), Copy; the live wait and the new server listed as Waiting to join at once |
| 5. What lives where, the plan | 0 presses; plan 1 press | The bar and the list grouped by place; "10 to move, none moved yet" with See the moving plan |
| 6. Build a new app | 1 press | Build a new app in the head always; ideas on the first visit |
| 7. Bring in an app | 2 presses, 3 fields | Add an app you already have, its own small view |
| 8. Backed up? | 0 presses | "Backed up 6 h ago / Restore tested 1 day ago" on each apps-server row; "Rouh cannot update, restart or back these up" once per other place |

## Navigation

The rail stays: Work, Apps, Dashboard. Inside the panel, five views, each with its own address so a notice, a link and Back work:

- `/apps`: the Dashboard
- `/apps/<name>`: one app (a notice "Meeting notes is not answering" links here)
- `/apps/setup`: set up an apps server, with the servers at its end
- `/apps/plan`: the moving plan
- `/apps/add`: add an app you already have

Every focus view has "All apps" at its top and Escape back to the Dashboard. The head keeps "Apps", Build a new app and the panel's close.

## Old place, new home

See `ia.md`, "Old place, new home". In short: the pitch is the first visit's empty state and a fold at the foot; the verdict is first; the flat list is grouped by place with what is true for a whole place said once; an app opens on its own view; servers live on the setup view (their state also on each place's heading); the pages with data are the last place, Rouh's own server; the plan is one line on the Dashboard and its own view.

## Views and states

| Folder | What it shows |
|---|---|
| `a-today` | Today's real shape: 6 apps on 2 servers that are not apps servers, 4 pages with data, no apps server, the Next step tracker |
| `a-down` | An app not answering, a failed backup, a failed update, a silent apps server, a long name and address |
| `a-app` | One app from a notice, not answering, a Restart running |
| `a-setup` | The setup line made, the live wait, the new server listed |
| `a-plan` | The moving plan, each way of moving said once |
| `a-empty` | The first visit |

## What the backend must supply

Almost all of it is in `apps_hosting.page()` today. Changes:

- **Needs you** already holds `down`, `backup`, `silent` and `failed`; the page shows `last_error` with a failed command.
- **Addresses:** `/apps/<slug>`, `/apps/setup`, `/apps/plan`, `/apps/add` served by the same page (`rouh/web/apps_hosting.py`, `address.js`), and the notice an app's watch sends (`_say`, `link=`) points at `/apps/<slug>` instead of `/apps`.
- **Make my setup line** returns the new server, which is then listed as Waiting to join with Cancel the setup line.
- **A page with data** keeps its words as today (`data_at`), shortened to "A shared list of 66 entries, and your choices (about 7 KB)".
- **Logs** is never held by another command running: logs are wanted most while something is going on.
- **A silent apps server:** a command for it stays "sent" and the page says the server takes it when it calls in.
- **The verdict** counts apps not checked yet ("6 of 7 apps are answering; Recipes has not been checked yet."), and a failed command in the last day shows on its app's row as well as in Needs you.
- **Moving plan:** `move_plan()` keeps its steps; the two ways of moving are said once (app, page), and each step only says its kind, from where and its data.

## Tokens, both themes

Rouh's own, from `rouh/static/app.css` (dark), with a light set derived. Rouh is dark only today; the light set is ready for when it is not.

| Token | Dark | Light |
|---|---|---|
| `--bg` | #0a0c10 | #eef1f5 |
| `--panel` | #12161c | #ffffff |
| `--panel-2` | #171c24 | #f6f8fa |
| `--line` | #232a34 | #d9dee6 |
| `--text` | #e7ecf3 | #121821 |
| `--dim` | #9aa6b6 | #4c5868 |
| `--accent` (buttons, links) | #5ec2ff | #0866a6 |
| `--good` (Answering, check circle) | #57d9a3 | #0d7752 |
| `--warn` (warning only) | #f2b45e | #8a5600 |
| `--bad` (Not answering, Silent, Failed; triangle, crossed box, crossed circle) | #ff7a70 | #b42d27 |
| in progress (Running, Sent, Waiting to join; clock) | `--text` | `--text` |
| `--seg-a` / `-b` / `-c` / hatched `-d` (the bar's places, neutral) | #9aabc2 / #4a5668 / #2c3542 / #222a35 | #3d4f66 / #8a96a6 / #b3bdc9 / #d3d9e1 |
| `--focus` | #ffd76a (Rouh's own) | #9a6b00 |

Type: Rouh's system sans; 24 (verdict), 22 (a view's sentence), 18 (head), 15 (section), 14 (body), 13 and 12 (facts, notes). Radius 14 and 9. Buttons Rouh's pill `ctl`, 44 px high (36 px small, with a 44 px press area). One primary per view: Set up an apps server while there is none, else Build a new app when nothing needs the owner, Restart on a down app's own view, Make my setup line and Copy on setup.

## Dropped, and why

- The three reasons and three steps on every visit before a server is ready: a person with six apps comes to see them, not the pitch. They are on the first visit and in the fold at the foot.
- "Not by Rouh" three times on every row: said once per place.
- The moving plan's repeated "how" on every item: said once.
- The servers section on the Dashboard: their state is on each place's heading; the cards are on the setup view, where they are acted on.

## Open

- Thirty apps: fold a place past eight rows (a SHOULD, not drawn).
- Rouh not reachable while the page is open: keep the last answer with a line saying so (a SHOULD, as today).
- Light theme: Rouh has none yet; the tokens are here for it.

## Built (28 November 2026, later)

The owner said go: built into `rouh/static/appspage.js`, `appspage.css`, the `appsView` layer and `/apps/<view>` addresses (`rouh/project/urls.py`, `app/address.js`, `app/runs.js`); notices about one app link to `/apps/<its name>`; a page with data says what it keeps in short (`keeps`). Vesela's round and critic rounds 4 to 6 on the built page are in `loop-log.md`. Where the built page and the prototype differ, the built page is right.

Still open, none of it a blocker: the Next card is long on a phone; one clock mark means both running and waiting to join; Rouh has no light theme, so the light tokens above are not used yet; thirty apps do not fold yet.
