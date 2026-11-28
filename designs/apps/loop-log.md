# Loop log: Apps

One direction, A, shown in six states (`a-today`, `a-down`, `a-app`, `a-setup`, `a-plan`, `a-empty`). Each round is a new critic given `critic-prompt.md` word for word, the brief, journeys, states, the guide's paths and the screenshots.

## Round 1: 5 blockers (fix)

Blockers found:
1. Erase and set up fell through to another press's message (a missing `break`).
2. Needs you's line for an app not answering had Restart and Ask Rouh to fix it only; Roll back, Logs and Open took two presses.
3. A row on an apps server showed the last backup but not the last test restore.
4. A failed command (an Update, a deploy) never reached Needs you.
5. After Make my setup line, the waiting server was named but not listed under Your servers, so its Cancel was missing.

Changed:
- All five fixed: the press, the line's five fixes, "Backed up 6 h ago, restore tested 1 day ago" on the row, failed commands in Needs you with Logs and Roll back, and the new server listed as Waiting to join with Cancel the moment its line is made.
- Quality: the moving plan says each way of moving once at its top and each row only says from where and where its data is; Show my VPSs is its own press again; the folds that hold must-keep things (the Hostinger token, the first-boot script, What Apps is) are plain folds, not the brown "not sure I keep it" toggle; Logs stays pressable while another command runs; work in progress is a clock shape in the text colour, so amber means only a warning; Build a new app is not the primary while something needs the owner; the bar's apps-server part is a neutral tint, not the button blue; "Page" is a kind with its own mark, not a state; Back and Take it off the list line up with the content; a running command's button is shown as running, not as a faded primary; the toast sits over the panel.
- Kept as is, with the reason: the yellow focus ring is Rouh's own `--focus` token on every screen; "about 5 to 10 euros a month" is today's wording in Rouh and its Guide, not a new number.

## Round 2: 1 blocker (fix)

Blocker found:
1. The ideas to start from were only on the first visit; once any app existed they could not be found.

Changed:
- The ideas are in "What Apps is, and why a server of its own" at the Dashboard's foot, each one press into the message box, as on the first visit.
- Quality: Logs opens with its output shown, not folded; Servers is reachable from the Dashboard in every state, and once an apps server is ready the servers come first on that view, with setting up another one folded below; each made-up app has its own code, key and memory; a command for a server that has gone silent stays "sent" and says the server takes it when it calls in; a failed backup is the same red with the same mark everywhere; Erase and set up stays disabled until the name is typed exactly; the legend's swatches have an edge so the darkest one shows; "Data: Not known:" no longer has two colons.

## Round 3: 1 blocker (fixed after the last round)

Blocker found:
1. After adding an app, its row said Not checked yet while the verdict still said "All 7 apps are answering".

Changed:
- The verdict counts an app not checked yet: "6 of 7 apps are answering; Recipes has not been checked yet." Proved by the scripted walk (Add an app, then read the verdict), since three rounds is the most the standard allows.
- Quality: on a down app's own view the fixes (Run it) come before Open; "Show what the server said" reads as a press; a failed update shows on its app's row too; the place marks are short bars, not boxes that look like checkboxes; the moving plan shows Ask Rouh to move it only once the apps server is ready.
- Left for the build, said in HANDOFF: thirty apps folding past eight rows, and the line when Rouh cannot be reached.

## Built, and Vesela's round (trial 65, 28 November 2026)

The owner said go: the design was built into the real Apps page (`rouh/static/appspage.js`, `appspage.css`, `/apps/<view>` addresses). Vesela, the stand-in user, then tried it on a phone in a test world with today's shape, as a review the owner asked for ("maybe a one round of vesela and fix it automatically"): check that every app works, see what still runs on Rouh, get her own apps server set up. She managed it partly, in 10 steps: the first two at once, the server not at all.

What she hit, and what changed:

| Problem | Fix |
|---|---|
| 548, 559: renting a server, with no price; does Set up cost money? | The next step and the company choice say: setting it up here is free; the server costs about 5 to 10 euros a month, paid to the company, not to Rouh |
| 565, 566: told to buy a server before being told it cannot work yet, with no way to do the first step | When this Rouh has no address on the internet, that comes first, at the top of the next step and of the setup view, with Connect Rouh to rouh.land; Make my setup line waits until then |
| 549: host, roll back, Linux server, number addresses, PostgreSQL, KVM | Plain words: company, other computer, undo a bad update; the address and the database's own words only in an app's facts; the hosts' steps say what KVM, hPanel and the browser terminal are |
| 550: "checked by address" | "Rouh opens each app's page every five minutes. Last look: 3 min ago." |
| 555: "cannot update, restart or back these up" with no next step | It says that is fine while they work, and what an apps server changes |
| 556, 558: 8 to move, 2 servers, 3 places | "8 to move (6 apps and 2 pages)"; the head counts apps and pages, not servers |
| 557: Briefings answers, yet "Rouh cannot reach the old server" | "Rouh cannot look inside this computer, so it does not know where their data is kept" |
| 561: Build a new app beside Set up an apps server | Build a new app says what it does on hover, and is the primary only once the server is ready |
| 562: "paste one line" where? | "Open your server's command window (Hostinger calls it Browser terminal), paste the line and press Enter." |
| 563: nothing helps choose a company | One line above the four: the price, and why Hostinger is recommended |
| 551: the round menu button covers the last lines | The page leaves room at its foot on a phone, so the last lines scroll past it |

Not Apps' own, and left as they are, said in the report: 552 (the chat button's lack of a word, the app's shared panel head), 553 and 554 (notices sliding over any page while reading), 564 (a night job's notice in codes), 560 ("New name" was the test world's made-up page).

## Rounds 4 to 6, on the built page

The standard stops the critic loop at three rounds; these three more were run on the built page itself, because landing takes a change to the screen only when its last critic round has no blocker.

- **Round 4: 1 blocker.** On a phone, Rouh's floating round button covered the last controls at the end of a scroll: the page now leaves room at its end. Also: the verdict says how many answer when one does not ("Meeting notes is not answering; 4 of 5 are."), a Needs you line keeps its "since" when a command is queued, a failed update no longer offers Roll back (the release before is still live), and the next step's button is quiet while something must come first.
- **Round 5: 1 blocker.** With no address on the internet, a server waiting to join was shown a setup line that cannot work and "turns Ready by itself": now it says the line waits for the address, shows no line and no wait, and the tracker marks nothing done. Also: an app on a silent server says so above its commands, the tracker's done mark is a drawn check, and a doubled colon in the plan is gone.
- **Round 6:** see below.
- **Round 6: 0 blockers (ship).** Fixed from its quality points: a waiting server's sentence on the Dashboard says the line cannot work until Rouh has its address, as the setup view does; the moving plan holds its moves, and says why, while the apps server is silent. Left, said in HANDOFF: the Next card is long on a phone, one clock mark for both running and waiting.
