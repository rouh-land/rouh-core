# Privacy: where a Rouh keeps its data, and what it sends where

The technical account behind the Guide's tip "Where your data lives, and what leaves it" (`rouh/handholding.json`, tip `privacy`, at `/guide/lesson/privacy`).
Petar asked for it on 25 November 2026, before Rouh's public release: "add a tip for privacy - where they data is stored, kept, what is sent where".
Every line below was read from the code that day. When the code changes what it stores or sends, change this file and the tip in the same commit.

Paths are for the container install (`deploy/stack/compose.yml`); a Rouh run straight on a server keeps the same things under `/var/www/rouh/`.

## Where it is kept

| What | Where |
|---|---|
| Chats and messages (`chat`, `message`, the model's transcript `messages`), tasks, projects, decisions, reminders, rules, contacts' rows, connection sign-ins | PostgreSQL, database `rouh`, volume `pgdata` |
| Memory (Synapse Master): every task, workspace file, chat, contact, and the copies below | the same database, schema `synapse` |
| Every request to a model, with what was asked, the answer, the reasoning, tokens, cost | `llm_requests` and `llm_pieces` (`rouh/llmlog.py`), written where the bytes go out |
| Copies from outside services | calendar: every event of every calendar the Google account reads, synced every minute once Google is connected (`rouh/synapse/sources/calsync.py`); Gmail: a whole inbox only when it is switched on (`rouh/synapse/sources/gmailsync.py`, `manage.py synapse_mail add`); every mail Rouh handles from someone else (`mail_cases`); Slack messages the app can see (`rouh/models/slack.py`); meeting summaries and transcripts from the owner's meeting library (`rouh/synapse/sources/meetings.py`). Drive is read live and not copied. |
| The workspace (tasks, steps, pages) | git: working copy `/data/workspace` on `core-data`, main repository on `workspace`; pushed elsewhere only if `ROUH_WORKSPACE_REMOTE` is set |
| Rouh's data folder and logs | `/data/rouh` on `core-data`; `logs/core.log` (10 MB, 5 files), `sent.log` (the full text of every message Rouh sends to someone other than the owner), `google-writes.log`, `contacts-writes.log` (these three are not rotated) |
| Uploaded files and their versions | `/run/one/files` on `one-run` (`rouh/filestore.py`) |
| Runs of Claude Code and Codex | the worker's home, `worker-home`: checkouts, run logs, and the tools' own transcripts (`~/.claude/projects`, `~/.codex/sessions`) |
| Nightly database copies | `backups`, made with `pg_dump` by `guard/bin/rouh-backup` |
| The browser | no volume; its profile is temporary, and saved logins are sealed rows of `browser_logins` |

**Sealed:** connection secrets, provider keys and browser logins are encrypted with Fernet (`rouh/encryption.py`), with a key made once at `/keys/encryption.key` on `keys`, readable by the `rouh` user alone. **Not sealed one by one:** chats, memory, the copies above, the logs and the nightly dumps (file permissions 0600). Whoever can read this machine's disk can read them, so encrypt the disk.

## What leaves, and to whom

Only to a service the owner set up, on the owner's own account or key (`rouh/service_keys.py`, `rouh/providerkeys.py`).

| Service | What it is sent | Code |
|---|---|---|
| The model provider: Anthropic, OpenAI, Google (Gemini), xAI | each request: the conversation, the system prompt, tool results, and the memory, mail and files picked for it; web search runs as the provider's own server-side tool | `rouh/llm.py`, `rouh/brain.py` |
| Claude Code and Codex runs | the run's prompt, the files it reads, its tool calls, to Anthropic or OpenAI | `one/` |
| Google (Gmail, Calendar, Drive, Docs, Sheets, Slides, Contacts) | reads and writes through the organisation's own OAuth client; there is no shared Rouh client | `GOOGLE.md`, `rouh/google_api/` |
| Telegram | messages to and from the owner's bot | `rouh/telegram*` |
| Slack | what Rouh posts and reads | `rouh/slack.py` |
| ElevenLabs | speech to be written down, answers to be spoken | `rouh/speech.py` |
| Voyage AI | memory text to be embedded for search by meaning | `rouh/service_keys.py` (`voyage`) |
| Philips Hue cloud, Dreame and Xiaomi clouds | light and vacuum commands | `rouh/hue.py`, `rouh/dreame.py`, `rouh/dreame_mi.py` |
| iCloud | contacts, synced both ways | `rouh/apple_contacts.py` |
| Apify, YouTube, Reddit | the names and words looked up | `rouh/linkedin.py`, `rouh/service_keys.py` |
| Open-Meteo, OpenStreetMap Nominatim | a location, for the weather and the place's name | `rouh/location.py`, `rouh/morning_brief.py` |
| Brevo | letters sent from Rouh's own address (a shared page, a password reset) | `rouh/mailer.py` |
| Stripe, Cloudflare, GitHub | what the owner asks Rouh to do there, with the owner's token | `rouh/payments.py`, `rouh/cloudflare.py`, `service_keys.py` (`github_runs`, `workspace`) |
| An S3 bucket of the owner's (weekly copy off the machine) | the whole database, encrypted with age to the owner's key or passphrase; the newest 8 kept | `rouh/offsite.py` |

The core holds the keys. The worker, the browser and the runs hold none: their only way out is the key proxy, which adds the key on the way out and refuses this machine and private networks (`deploy/stack/compose.yml`, `keyproxy`).

## What reaches Rouh's makers

- **No telemetry, analytics or crash reporting.** None in the Python, its dependencies, the templates or the static scripts. (`WORK_TREE.md`, called `TELEMETRY.md` until 25 November 2026, describes the orb's picture of the work running on this machine; it is drawn in the owner's own page and never leaves.)
- **A Connected Rouh** sends rouh.land its birth (a name and a public key; the private half never leaves) and the owner's email, for the account (`rouh/birth.py`, `rouh/templates/rouh/firstrun.html`). It joins the Gene Pool with its name and public key; a gene leaves only after an administrator approves it, as its name, sentence, contract and description with names, addresses and numbers taken out, never its code (`rouh/genepool.py`). For genes it gave or installed it sends banded usage figures daily, never a chat or a person's words (`genepool.py`).
- **Model totals** (counts, errors, cost, response times per model, with an install hash that changes monthly, never a request or an answer) are built, and only sent when `ROUH_MODEL_OUTCOMES_SEND` is on. It is off: today it is a dry run and nothing leaves (`rouh/modeloutcomes.py`, `rouh/config.py`).
- **The relay** gives a Connected Rouh `<name>.rouh.page`. It routes HTTPS by host name and passes it on still encrypted; only the Rouh holds the certificate. It sees the host name, connection metadata and the byte count. The owner turns it off in Connections, Phone (`rouh/relay.py`). What the relay's own server logs is not in this repository.
- **Sharing a page with one person** asks rouh.land to vouch for the guest's email; rouh.land never sees the page (`rouh/landshare.py`). Published pages are served by the Rouh itself at `/p/<token>` (`rouh/pages.py`).
- **Downloads every Rouh makes:** the model list and starting rules from rouh.land daily, and, for a Connected Rouh on Ride along, its updates (`release.json` from rouh.land, code from GitHub). They send a User-Agent and nothing of the owner's; the servers see the IP address (`rouh/modelstandard.py`, `rouh/ruledefaults.py`, `rouh/code_update.py`). A Rouh on its own checks for updates only when told.
- `rouh.it` is retired and never called (`rouh/site.py`).

## How long it is kept

Anatomy, Meta, What Rouh keeps and runs (`/anatomy/meta/keeps`, `rouh/lean.py`) sets it; a sweep runs every 23 hours, and lowering a limit deletes only after the owner confirms. A new install (`PRESETS["installed"]`):

| Record | Kept |
|---|---|
| Model calls: their words | 14 days, then blanked |
| Model calls: cost, tokens, time | 400 days |
| Synapse search working and step logs | 14 days |
| Turn records | 30 days |
| Model outcomes, usage events, audit trails | 90 days |
| Old versions of memory items, contacts, pages, files | 90 days, the newest always kept for Undo |
| Old versions of cards | the newest 50 |
| Run logs | 30 days after the run |
| Nightly database copies | the number confirmed there; `ROUH_BACKUP_KEEP` (7) until one is |
| Files in the bin | 30 days (`ROUH_FILES_BIN_DAYS`) |

Kept until deleted: chats ("nothing deletes a chat on a clock"), tasks, the workspace's git history, uploaded files, memory and the copies in it, Slack messages, Claude Code's and Codex's transcripts, and the three unrotated logs above. What a provider keeps of what it was sent is under its own terms.

## Export and delete

- **Export:** `python manage.py export_rouh --out /data/export/rouh.bundle --dump newest` in the core container: one file with the database, both keys, the data folder and the workspace. It opens every saved login, so it is written for its owner alone (`rouh/management/commands/export_rouh.py`). Backups: `rouh-backup now|list|restore` in the backup container. There is no download button in the app.
- **Incognito chat:** deleted when it ends, never written to memory; the model log keeps tokens, cost and time without words (`rouh/incognito.py`).
- **Deleting a chat** removes it with everything it owns, its transcript, cards and timelines, and memory's copy (`rouh/owning.py`, `rouh/memory.py`). Its words in `llm_requests` age out with that record (14 days).
- **Deleting a memory item** removes its text, index, links and versions, and a contact from iCloud too; a tombstone keeps the id, source and date (`rouh/synapse/ingest.py`).
- **Disconnecting Google** revokes the grant at Google and deletes the tokens; copies already in memory stay until deleted (`rouh/google_oauth.py`, `rouh/google_store.py`). Every other connection's page has Disconnect, which deletes its sign-in.
- **Deleting everything:** there is no account deletion command; remove the stack with its volumes. Anything deleted is still in the nightly and weekly copies until they rotate out.
