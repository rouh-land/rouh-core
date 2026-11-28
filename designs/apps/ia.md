# Structure: Apps

Built from `journeys.md`, not from today's page.

## Views

One panel beside the chat, at `/apps`, with four focus views inside it, each with its own address so a notice or a link can open it and Back returns to the Dashboard.

| View | Address | Answers first | Journeys |
|---|---|---|---|
| **Dashboard** | `/apps` | "All 6 apps are answering. Nothing needs you." | 1, 2, 3 (open), 5, 8 |
| **One app** | `/apps/<name>` | "Meeting notes is answering," its address, and its actions | 2 (from a notice), 3, 8 |
| **Set up an apps server** | `/apps/setup` | "Buy a small server, paste one line, and it turns Ready by itself." | 4 |
| **Moving plan** | `/apps/plan` | "10 to move onto your apps server. None moved yet." | 5 |
| **Add an app you already have** | `/apps/add` | the 3 fields | 7 |

A first visit with nothing at all is the Dashboard's empty state: what Apps is, the ideas, why a server of its own, and the two ways in.

## The Dashboard, top to bottom

1. **Head:** "Apps", a line of counts ("6 apps, 4 pages with data, 2 servers"), Build a new app (secondary while the apps server is the next step, primary after), the chat toggle and close of the panel.
2. **Verdict:** one sentence with its shape, when it was checked, Check now.
3. **Needs you:** one line per thing with its fix beside it; with nothing, the verdict says "Nothing needs you" and the section is not drawn.
4. **Next step**, only while there is no apps server: a four-step tracker (Pick a host, Buy a server, Paste the line, Ready), where the owner is on it, and the view's one primary button, Set up an apps server.
5. **Where your apps live:** the summary picture, one bar split by place (apps server, each other server, Rouh's own server for the pages) with the count in each part, and the moving plan in one line with See the plan.
6. **The list, grouped by place,** in the bar's order: each place a heading with its state and what is true for all of it (checked by address only; not backed up by Rouh; Rouh cannot see its data), then a row per app: shape and state, name, address (Open), last check; on an apps server, last backup. A row presses into One app. Pages with their own data are the last group, Rouh's own server, each row with what it keeps and Open page.
7. **Foot:** Add an app you already have, and a brown toggle "What Apps is, and why a server of its own" with the Guide link.

## One app

Back to Apps; the name, its state sentence; Open (address) and Ask Rouh to change it; the commands (Update, Restart, Roll back, Logs, Back up now, only on an apps server; Check now always); when a command runs, its live line at the top; the facts as a two-column list; What Rouh did (each command, state, time, output folded); Take it off the list at the end, quiet, with a confirm.
On a server that is not an apps server, one line instead of the commands: "On the sites server Rouh can only check its address. Once your apps server is ready, Rouh can move it there." with Ask Rouh to move it (when ready) or Set up an apps server.

## Set up an apps server

Back; the sentence; host as four big choices (Hostinger first, Recommended); that host's plan and steps, numbered (they are a sequence); Make my setup line (primary); then the line with Copy, the first-boot script folded, "works once, for one server, for seven days"; the live wait. The Hostinger token path folded under the steps. The warning when Rouh has no address on the internet replaces the line.
Servers also live here, at the end: each server card with its state, facts, Ask for a report, Take it off the list or Cancel. (Servers are rarely looked at; the Dashboard's place headings carry their state.)

## Moving plan

Back; the sentence; the target (your apps server, or "not set up yet" with Set up an apps server); an ordered list (it is a sequence: one at a time), each item: what, from where, how in one line, where its data is now, Ask Rouh to move it (disabled with the reason until the apps server is ready).

## Old place, new home

| Today | Now |
|---|---|
| "Rouh can build you any app" pitch, ideas, three reasons, three steps, at the top always until a server is ready | First visit with nothing: the empty state. Otherwise: the brown toggle at the foot, and the Next step tracker while there is no apps server |
| Verdict below the pitch | The first line |
| Needs you | Under the verdict, unchanged in substance |
| Your apps (flat list, each row with Runs on, Updated, Checked, Backed up) | Grouped by place; what is true for a whole place said once on its heading |
| App opening in place under its row | One app, its own view and address |
| Servers section | Each place's heading on the Dashboard; the server cards in Set up an apps server |
| Pages with their own data | The last group of the list, Rouh's own server |
| Moving onto your apps server (every item again) | One line with a count on the Dashboard; the plan its own view |
| Set up sheet over the page | Its own view |
| Add form inside the list | Its own small view |

## Must keep, and where it lives

| Must keep | Where |
|---|---|
| Verdict, checked when, Check now | Dashboard, first |
| Needs you with its fixes | Dashboard, second; and One app |
| Open, Ask Rouh to change it, Check now | Row (Open), One app |
| Update, Restart, Roll back, Logs, Back up now | One app |
| Facts, What Rouh did, Take it off the list | One app |
| Servers: state, facts, Ask for a report, Take off / Cancel | Place headings (state); Set up view, Servers |
| Hosts, steps, Make my setup line, line, Copy, first-boot script, once and seven days, never buys, no-address warning, live wait | Set up an apps server |
| Hostinger token: save, Show my VPSs, Set it up, Erase with the name typed, Forget | Set up an apps server, folded |
| Add an app you already have | Its view, from the Dashboard's foot |
| Pages with data, where their data is kept | Dashboard, the Rouh's own server group |
| Moving plan, Ask Rouh to move it | Dashboard line; Moving plan view; One app |
| Build a new app, ideas, what and why, Guide link | Head; empty state; foot toggle |

## Walking the journeys

1. Open Apps: line 1 is the verdict. 0 presses. Met.
2. Notice opens `/apps/notes`: the sentence "Meeting notes is not answering, since 10:42", Restart beside it: 1 press. From the Dashboard: Needs you, Restart on its line: 1 press. Met.
3. Open: the address on the row, 1 press. Change: row (1), Ask Rouh to change it (2), type. Restart: row (1), Restart (2). Met.
4. Set up an apps server (1), Hostinger picked, Make my setup line (2), Copy (3). Met.
5. Bar and grouped list on the Dashboard: 0 presses; See the plan: 1. Met.
6. Build a new app in the head: 1. Met.
7. Add an app you already have (1), 3 fields, Add (2). Met.
8. Row (apps server) or place heading (elsewhere): 0 presses. Met.
