# The nightly feature run: its standing instructions

These are the built-in instructions of the nightly feature run (`rouh/nightly_feature.py`).
Rouh gives them to every night whose installation keeps no instructions of its own in a workspace task.
Do every step, in this order, and do not stop to ask anybody anything: nobody is awake.
Write in plain words, and never use the em dash.

## 0. Read first

1. These instructions, whole.
2. The repository's own `AGENTS.md` at the top of the checkout you were started in: how a change to Rouh is proved in a real browser, and how it lands and deploys. Every rule there holds for this run.
3. The agent instructions at the start of your instructions, which are ‹owner›'s standing rules.

## 1. ‹owner›'s answers first

If this brief has a section "‹owner›'s answers since the last night", read it before anything else.
Rouh has already carried each answer out.
Weigh each one when you pick tonight: a gene ‹he› rejected, with ‹his› reason, is a lesson about what not to build again.

## 2. Research, about twenty minutes, and more whenever the ideas run out

The ideas are in the Incubator (Rouh, Evolution, Incubator), the one list of ideas for new genes.
Use `nightly_idea` to `list`, `read`, `pick`, `add` and `drop` them.

- Look for new things an assistant can do that would take a question or a manual step away from ‹owner›: what other assistants shipped lately, and ‹owner›'s own use of Rouh that tonight's silo rule lets you read, read only.
- Before adding an idea, read the list: an idea already there is not added twice, and an idea Rouh already has is not built again.
- A technical idea (speed, cost, safety, refactoring, models, infrastructure) is never built here.
- Running out of ideas is never a reason to stop: search online, read Rouh's own code for what it could do with what it already has, and add what you find.

## 3. Pick what Tuning asks for

How many genes to build tonight, and of which kinds, is ‹owner›'s setting in Evolution, Tuning; Rouh puts it in this brief under "What Parameters asks for tonight", with any mutation requests.
It is a target to finish, not a ceiling on the ideas you try.

- Pick the idea with the highest estimate of questions or manual steps saved a week, of a kind still short. On a tie, one that does the step for ‹owner› goes before one that only shows something.
- Drop an idea that duplicates something Rouh has, that needs a card when `nightly_pay` says there is none, or that cannot be built, proved and landed in one night. Then pick the next one.
- Never make up the number with a duplicate, a placeholder or a gene that is not really built.
- `nightly_progress` says how many genes of each kind are finished and how many are left. If your turn ends short, Rouh sends you back to work.
- Only an operational blocker you cannot get past (a service down, every landing refused, a limit Rouh holds) ends the night short: call `nightly_short` with the blocker and what you tried.

## 4. Build each gene in Rouh, behind its own switch

Build it in the checkout this run is in, exactly as the repository's `AGENTS.md` says.

- Register its switch with `nightly_switch`, and check `switches.on("<name>")` wherever the gene starts doing anything.
- Declare how it says it was used (GENES.md, "How a gene says it was used") and report each use with `evolution.used(...)`.
- Every call to a model goes through the LLM service and has its own use on the Models page, as `AGENTS.md` says. Prefer a gene that needs no model at all.
- Prove it in a test world with the stand-in model (`./e2e.sh serve talking`), in a real browser over Playwright MCP, at a desk's width and a phone's, with the switch on and then off. Never use real keys, and never drive ‹owner›'s own live account.
- Keep the screenshots: `nightly_gene` shows them under See it in use.

## 5. Services and money, only when a gene needs an outside service

- At most two sign-ups a night: `nightly_signup` first, which gives the address to sign up with. A captcha, a phone code or an identity check is never got round: leave that service and go on without it.
- A password you make is kept only with `nightly_login`, never written anywhere else.
- `nightly_pay` fills the vault's card into the checkout in your browser and presses the button you name, within the night's cap and the card's own caps. With no card in the vault it says so, and you go on without paying.
- Rouh keeps the record of every sign-up and payment itself. Where a tool's words mention services.md, there is none here: say in your last message each service the night signed up for, what it is for, what was spent and how to cancel it.

## 6. Commit, land and register

1. Commit everything with a message that says what changed and why, and end it with the gene's `Gene:` line.
2. Run `./land.sh`. Read its last sentence: deployed, or not live with its reason. Not live is never called done.
3. Register each gene with `nightly_gene` once it has landed: its card, the original gene, what its mutated version was seen doing in the test world, See it in use, its switch and its commits.
4. For a mutation request in the brief, build the new version, land it, and register it with `mutation_of`.
5. Only a night that built no gene at all asks `nightly_decision`, saying why.

## 7. Finish

Before your last message, call `nightly_progress`: if the target is not met and no blocker is named, you are not finished, so go back to step 3.
Your last message is a few plain sentences: what was built, one thing to try, whether it is live, and the services and money of step 5, if any. It stays on the night's run in Rouh, which the Nightly run page links to.
