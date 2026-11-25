# Contributing to Rouh

Thank you for wanting to help.
Rouh is open source under the Apache License, Version 2.0 (see `LICENSE`).
Rouh's code is being assigned to TwoGears EOOD (see `NOTICE`), and is planned to move to a non-profit Rouh Foundation later.

Please read this page before you open a pull request: it says honestly how changes get in today, so your time is not wasted.

## How it works today

Rouh is young, and it holds people's mail, calendars, files and keys.
So for now every change is reviewed by one person, the project's owner, and nothing reaches `main` without that review.
That is slow on purpose.
A team of trusted reviewers, and later maintainers with a written way of deciding, are planned, but they do not exist yet.

What this means for you:

1. **Start with an issue.** Open a bug report or an idea first (the issue forms ask the few questions we need), and wait for an answer before you write a lot of code. Something we would not take is better said before you build it than after.
2. **Small changes are best.** One fix or one idea per pull request, with as few files as it needs. A pull request of a few dozen lines is read in days; one of thousands of lines may wait a long time, or never be merged as it is.
3. **The owner reviews everything.** Rouh writes a plain-words review of each pull request for the owner: what it changes, why, which parts of Rouh it touches, how risky it is, and how its tests went. The owner then decides.
4. **There are four possible answers:** merged as it is; changes asked for (you are told exactly which); declined, with the reason; or **rebuilt our way**. The last means the idea is taken, but the code is written again to fit Rouh's own design, and you are credited in the commit that does it (a `Co-authored-by:` line) and told where it landed. Please do not take a rebuild as a rejection: it is often the quickest way for a good idea to reach everybody.

Security fixes are read straight away. Everything else is read in a weekly batch, so expect an answer within about a week, sometimes two.

## Most new abilities are genes, not pull requests

Rouh is built so that each installation can change itself.
A new ability - a new page, a tool, a connection to a service, a new way of doing something - is a **gene** (`GENES.md`): it lives in the Rouh that grew it, and is shared with other Rouhs through the **Gene Pool** on rouh.land (`EVOLUTION.md`), where each owner chooses whether to take it.

So before you open a pull request for a feature, ask whether it should be a gene instead.
Pull requests to this repository are best for:

- bugs in the core: something that is broken for everybody;
- security fixes (but see `SECURITY.md` first: report privately);
- documentation, plain-words fixes, and typos;
- changes to the shared parts every gene stands on, discussed in an issue first.

A feature that only some people want is almost always better as a gene.

## Before you open a pull request

- Fill in the pull request template: what it changes, why, how you checked it, and which issue it belongs to.
- **Prove it yourself.** This repository has no committed test suite (`AGENTS.md`, "Every feature proves itself"). Run the app (`./e2e.sh serve` stands up a throwaway one), do what a person would do in a real browser, and say in the pull request what you saw on the screen.
- The automatic checks run on every pull request, in GitHub's sandbox with no secrets and read-only access, so no code in a pull request can reach anything private. Your pull request needs them to pass.
- Follow the house rules in `AGENTS.md`: no real person's name, address or data anywhere in the code, examples on `.example` and `.test` domains, no em dash, one sentence per line in long Markdown files.
- Every new file belongs to a gene (`rouh/genes/owners.json`); the checks tell you if one does not.

## Sign off every commit (the DCO)

We do not ask you to sign a contributor agreement.
Instead, every commit must carry a sign-off line, by which you certify the Developer Certificate of Origin 1.1 (the `DCO` file in this repository, also at https://developercertificate.org/):

    Signed-off-by: Your Name <your.email@example.com>

Git adds it for you with `git commit -s`.
Use your real name (or the name you are publicly known by) and an email address that reaches you.
A pull request whose commits are not all signed off cannot be merged; an automatic check says which ones are missing it.

By signing off you confirm that you wrote the change or have the right to submit it under the Apache License 2.0.
Your contribution is then licensed under the Apache License 2.0, as section 5 of that licence says.
You keep the copyright in what you wrote; you do not give it to TwoGears or anyone else.
The same holds when your idea is rebuilt our way: the rebuild credits you, and any of your own lines it keeps stay yours under the same licence.

## Code written with AI tools

You may use AI tools.
You are responsible for what you submit: read it, test it, and make sure it does not copy code whose licence does not allow it.
If a large part of a change was generated, say so in the pull request.

## Copyright lines in files

Do not add your own copyright header to a file.
The project's rule is in `COPYRIGHT-HEADERS.md`: new files get the short SPDX line, and the git history records who wrote what.

## The name

"Rouh" is a trade mark of TwoGears EOOD.
You may say your fork or product "is based on Rouh" or "works with Rouh", but do not call it Rouh or use Rouh's logo for it.

## Security

Do not report security problems in public issues or pull requests.
See `SECURITY.md`.
