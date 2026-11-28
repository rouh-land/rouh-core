# Brief: Apps (the Dashboard and every Apps screen)

## The owner's words (28 November 2026)

> "the apps feature design is terrible. did it go through our design methodology and journeys?"

And the request that set the feature, the same morning:

> "under work in the navigation, let's have apps. and the first item there should be Dashboard which would control the server and have a list of all the apps, their status etc. dashboard would also have the initial explanation of what this is and why and what needs to be done to setup. also let's add the necessary apps section in our official guide."

And: workspace pages with functions and databases run on Rouh's own server and count as apps too; list them with where their data is kept and plan their move, moving nothing yet.

What the owner comes to Apps to do, as the redesign request names it: is everything up, what needs me, set up a server, open or change one app, what lives on Rouh and the moving plan.

## What this is

Apps is where the owner sees and runs the web apps Rouh built or looks after for them: whether each answers, what needs them, where each one runs and keeps its data, and the apps server of their own that the apps should all move onto.
It is a panel inside Rouh, beside the chat; "Build a new app" and "Ask Rouh to change it" put a sentence in the chat's message box.

## Who comes here, and how often

The owner, on a desk most days for a few seconds ("is everything up?"), and from a phone notice when an app stops answering ("Meeting notes is not answering").
Rarely and for longer: setting up the apps server (once), bringing in an app that already runs somewhere, and the move onto the apps server (once per app).

## The journeys it must make obvious and quick

In `journeys.md`, with targets. In short, by how often they happen:

1. Is everything up? (most frequent)
2. What needs me? (from a notice, or on opening)
3. Open or change one app
4. Set up my apps server (once, but it is the next step today)
5. What lives where, and the moving plan
6. Build a new app
7. Bring in an app that already runs somewhere
8. Are my apps backed up?

## Freedom

Design it around what the owner comes here to do, not around today's page. Rethink the structure freely: merge, split or drop sections, add views the data supports (one app on its own, the setup on its own, the moving plan on its own), and say where something belongs somewhere else.
The navigation inside Apps, the section names and the order are free. The rail entry (Work, Apps, Dashboard) stays.

## Must keep (the only fixed things)

- The verdict on whether every app answers, when it was checked (every five minutes, by address) and Check now.
- Needs you: an app not answering (Restart, Roll back, Logs, Ask Rouh to fix it, Open), a failed command, backup or test restore, an apps server that has gone silent.
- Each app: Open (its address), Ask Rouh to change it, Check now, and on an apps server Update, Restart, Roll back (to the release before), Logs, Back up now; its facts (where it runs, where its data is kept, release, last backup and test restore, code and deploy key, the last failed deploy) and What Rouh did (each command with its state and output); Take it off the list.
- Servers: each with its state (calling in, silent, waiting to join, checked by address only), its facts (host, address, system, memory, disk, apps on it), Ask for a report, Take it off the list or Cancel.
- Set up an apps server: the four hosts (Hostinger first and recommended, Hetzner, DigitalOcean, any Linux server), each host's steps and plan, Make my setup line, the line with Copy, the same as a first-boot script, "works once, for one server, for seven days", "Rouh never buys a server", the warning when this Rouh has no address on the internet, waiting for the server to call in and turning Ready by itself.
- The Hostinger token path: paste and save the token (sealed, never shown again), Show my VPSs, Set it up for a fresh VPS, Erase and set up only with the VPS's name typed back, Forget the token.
- Add an app you already have: name, address, which server or where in words.
- Workspace pages that keep data on Rouh, with where their data is kept, and the moving plan (every app not on an apps server and every such page, one line each, nothing moved; Ask Rouh to move it once a server is ready).
- Build a new app, the ideas to start from, and what Apps is and why apps get a server of their own (for a first visit, and findable later), and the link to the Guide's topic "Your apps".

## Style

Rouh's own design system: its dark tokens (`--bg`, `--panel`, `--line`, `--text`, `--dim`, `--accent` blue, `--good`, `--warn`, `--bad`), its system sans, its radius (14 and 9 px), its button style (`ctl`). Light tokens are derived for the light theme.
An operational screen: a verdict sentence first, then a summary picture, then detail. No marketing on the page of someone who already has apps. One primary button per view. State is never colour alone: a shape and a word go with it.
Desk first (the panel is about 830 px wide beside the chat at 1440), and it must work on a phone at 390 px.

## Inputs

- Today's screen, as evidence of the data and the problems (`input/shots/`): the pitch, the three reasons and the three steps fill the first screen of someone with six apps; the verdict is below the fold; every row repeats "Not by Rouh" three times; servers, pages with data and the moving plan are at the bottom, and the plan repeats every app and page again.
- The real scale today (the owner's own Rouh, 28 November 2026): 6 apps, all answering, checked every five minutes; 2 servers, neither an apps server (5 apps on one, 1 on the other, whose data Rouh cannot see); 4 workspace pages that keep data on Rouh (one shared list of 66 entries; choices of 18 KB, 7 KB, 1 KB and 1 KB); a moving plan of 10, none moved; no apps server yet. The prototype uses made-up names at this same scale.

## Settled words

- **App**: a web app at an address of the owner's. **Apps server**: a server of the owner's own that Rouh set up for apps ("the standard"). **Server**: any server an app runs on; one that is not an apps server is "checked by address only".
- **Answering / Not answering / Not checked yet**: an app's state by its last check.
- **Calling in / Silent / Waiting to join / Checked by address only**: a server's state.
- **Needs you**: what waits on the owner.
- **Page with its own data**: a workspace page that keeps data on Rouh's own server.
- **Moving plan**: what moves onto the apps server, one at a time, when the owner says so. "Nothing moves until you say."
- **Setup line**: the one line pasted on a new server.
