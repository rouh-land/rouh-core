# The apps server

An apps server is a small rented server, a VPS, where Rouh hosts the apps a person asked it to build.
One server holds many small apps, each kept apart from the others, each with its own address, database, backups and history.
There is no Docker: every app is a plain Linux user, a PostgreSQL database and a systemd service, which a person can look at and understand with ordinary tools.

The server calls Rouh every 30 seconds and takes the commands waiting for it; Rouh never connects to it.
So it works with any host and behind any firewall.
`CONTRACT.md` is the exact interface between the server and Rouh, and the one place both sides read.

What is in this folder:

| File | What it is |
|---|---|
| `setup.sh` | The script Rouh serves at `/apps/join/<code>`, which turns a fresh server into an apps server. |
| `rouh-app` | The command that does everything to an app, installed as `/usr/local/bin/rouh-app`. |
| `rouh-apps-agent` | The agent that checks in with Rouh and runs its commands, at `/usr/local/lib/rouh-apps/`. |
| `rouh-apps-agent.service` | Keeps the agent running. |
| `rouh-apps-backup.service`, `rouh-apps-backup.timer` | The nightly backups, at 03:30 server time. |
| `CONTRACT.md` | The interface with Rouh. |

## Making one

Buy the smallest VPS that has at least 1 GB of memory, with Ubuntu 24.04, Ubuntu 22.04 or Debian 12, at any host.
In Rouh, press Set up an apps server.
Rouh shows one line, good for 7 days and for one server:

```bash
curl -fsSL https://<rouh>/apps/join/<code> | sudo bash
```

Log in to the new server by SSH and run that line, or give it to the host to run on first boot, as below.
It takes about five minutes, prints one line for each step, and ends with "This apps server is ready."
Everything it prints is also kept in `/var/log/rouh-apps-setup.log`.
Rouh's page then shows the server within a minute.
It is safe to run twice: a step already done is done again the same way, and a server that has joined keeps its key.

As a first-boot script, give the host this, with the line Rouh showed:

```bash
#!/bin/bash
curl -fsSL https://<rouh>/apps/join/<code> | bash
```

- **Hostinger**: in the VPS's settings, under OS and panel, open Post-install script, paste it, save, and reinstall or create the VPS with it.
- **Hetzner Cloud**: when creating the server, paste it into Cloud config; a script that starts with `#!/bin/bash` is run as it is.
- **DigitalOcean**: when creating the Droplet, tick Advanced options, Add initialization scripts, and paste it into User data.
- **Anywhere else**: whatever the host calls user data, cloud-init or a startup script, as long as it runs a bash script as root once.

What the setup does, in order:

1. Checks it runs as root on an apt-based system, and stops with a plain sentence otherwise.
2. Installs Caddy, PostgreSQL, Python, git, the firewall and automatic security updates from the distribution, with nothing asked. Ubuntu 22.04 has no Caddy of its own, so there Caddy comes from Caddy's own signed package source.
3. Adds 2 GB of swap when the server has under 2 GB of memory and no swap.
4. Opens SSH (first, so nobody is locked out), 80 and 443 in the firewall, and closes the rest.
5. Sets Caddy up to read one file per app from `/etc/caddy/apps/`.
6. Makes the user `rouh`, which Rouh's jobs log in as by SSH with the keys Rouh lists, with sudo and no password.
7. Installs `rouh-app`, the agent and the nightly backups.
8. Tells Rouh about the server, writes the key Rouh gives it to `/etc/rouh-apps/agent.json`, and starts the agent.

## The standard every app is on

Every app on an apps server is built the same way, so any job or any person can work on any of them.

- Its own Linux user, `app-<name>`, and its own folder, `/srv/apps/<name>`.
- Its own PostgreSQL database and login, `app_<name>`, with a random password, given to it as `DATABASE_URL`.
- Its own systemd services, `app-<name>` for live and `app-<name>-test` for the test copy, with a memory limit (512M unless it says otherwise), restarted when it fails, and allowed to write only to its own `shared/` folder.
- Its own git history: every release is one commit, unpacked into `releases/<UTC stamp>-<short sha>/`, with its own Python environment.
- Pinned packages: every line of `requirements.txt` is `name==version`; a line that is not gets a warning.
- The test copy first, then live: a release only reaches live once the test copy has started and answered its health check.
- One step back: `rouh-app rollback` puts live back on the release before.
- Nightly backups at 03:30 server time, 14 kept, each followed by a test restore into a throwaway database.
- An HTTPS address through Caddy, with its certificate got and renewed by itself: the domain given, else `<name>.<ip with dashes>.sslip.io`, which works with no DNS at all. The test copy is at `test-<name>.` before the same.

An app's name is 2 to 28 small letters, digits and dashes, starting with a letter.

### The folder of an app

```
/srv/apps/<name>/
  repo.git/                    the code, fetched with the app's own deploy key
  releases/<stamp>-<sha>/      the last 5 releases, each with its own .venv
  live -> releases/...         what the live service runs
  test -> releases/...         what the test copy runs
  shared/.env                  the app's own settings, KEY=value, kept across releases
  shared/deploy_key            the key that reads its repository
  shared/...                   uploads and anything else the app writes
  backups/                     <stamp>.dump and <stamp>-files.tar.gz, 14 of each
```

Its record is `/etc/rouh-apps/apps/<name>.json`, and its addresses are in `/etc/caddy/apps/<name>.caddy`.

### What the code must have

The code is a git repository, private on GitHub or anywhere `git` can reach by SSH.
At its top, `rouh-app.json` says how it runs:

```json
{"kind": "python", "start": "gunicorn -b 127.0.0.1:$PORT app:app", "migrate": "", "health": "/healthz",
 "memory": "512M", "database": true}
```

- `start` is the command that runs it, and it must listen on `127.0.0.1:$PORT`.
- `migrate` is run once for each release, before the test copy starts, with the same environment; empty for none.
- `health` is a path that answers 200 when the app is well; it is checked for 30 seconds after every start.
- `memory` is its limit; one given to `rouh-app new --memory` wins.
- `database` asks for its database.
- A static site has `"kind": "static"` and may name the folder to serve with `"root": "dist"`; it needs no service, and Caddy serves its files.

A Python app also has `requirements.txt` with every package pinned, gunicorn included, and a `/healthz` that answers 200.

Every app gets in its environment:

| Name | What it is |
|---|---|
| `PORT` | Where to listen, on 127.0.0.1. The test copy has its own. |
| `DATABASE_URL` | `postgresql://app_<name>:...@127.0.0.1:5432/app_<name>`, when it has a database. |
| `APP_NAME` | Its name. |
| `APP_URL` | Its own HTTPS address; in the test copy, the test copy's address. |
| `APP_SLOT` | `live` or `test`. |

Everything in `shared/.env` comes on top of those, so that is where an app's own secrets and settings go.
The test copy runs with the same database and the same `shared/` as live: it proves a release starts and answers, it is not a second set of data.

## Putting a new app on it

1. Write the app in a private GitHub repository, with `rouh-app.json`, a pinned `requirements.txt` and a `/healthz`.
2. Make the app on the server. From a job, with Rouh's `apps` tool, action `command`, verb `new`, the app's name, and the args `kind`, `repo` (its SSH address, like `git@github.com:someone/notes.git`), and if wanted `branch`, `domain`, `memory` and `database`. Or by SSH as the user `rouh`:

   ```bash
   sudo rouh-app new notes --kind python --repo git@github.com:someone/notes.git
   ```

3. It prints the app's deploy key, a line starting `ssh-ed25519`; Rouh's report of the server shows it too. Add it to the repository on GitHub under Settings, Deploy keys, as a read-only key.
4. Deploy it: verb `deploy` with the `apps` tool, or `sudo rouh-app deploy notes`.
5. It answers with its address, like `https://notes.203-0-113-7.sslip.io`.

To give it a domain of its own, point the domain's DNS (an A record) at the server, and `test-` before it too if the test copy should have one, then run `sudo rouh-app new notes --domain notes.example.com`, which changes only what it is given.

## Everyday work

| To | From a job (`apps` tool, verb) | By SSH |
|---|---|---|
| Put out the newest commit of its branch | `update` | `sudo rouh-app update notes` |
| Put out one branch, tag or commit | `deploy` with `ref` | `sudo rouh-app deploy notes --ref v1.4` |
| Go back one release | `rollback` | `sudo rouh-app rollback notes` |
| Restart it | `restart` | `sudo rouh-app restart notes` |
| Read its log | `logs` with `lines` | `sudo rouh-app logs notes --lines 500` |
| Back it up now | `backup` | `sudo rouh-app backup notes` |
| Check the newest backup restores | `restore-test` | `sudo rouh-app restore-test notes` |
| See every app | `check`, then the report | `sudo rouh-app status` |

`sudo rouh-app help` says all of it on the server.
Every failure ends with a plain sentence and a nonzero exit, which the agent sends back to Rouh.

A deploy that fails its check on the test copy leaves live as it was.
One that passes on test and then fails on live puts live back on the release before and says so.
A rollback changes the code, not the database: a migration that changed the database is not undone, so a migration should keep the release before working.

## Restoring a backup for real

The nightly test restore proves a backup can be restored; to put one back into the app itself:

```bash
sudo rouh-app backup notes                          # first, a backup of how it is now
sudo systemctl stop app-notes app-notes-test
ls /srv/apps/notes/backups/                         # pick the stamp
sudo -u postgres pg_restore --clean --if-exists --no-owner --role=app_notes \
     -d app_notes /srv/apps/notes/backups/<stamp>.dump
sudo tar -xzf /srv/apps/notes/backups/<stamp>-files.tar.gz -C /srv/apps/notes   # the shared/ folder
sudo rouh-app restart notes
```

## Moving an app to another server

1. On the old server: `sudo rouh-app backup notes`, then copy `/srv/apps/notes/backups/<stamp>.dump` and `<stamp>-files.tar.gz` to the new one.
2. On the new server: `sudo rouh-app new notes` with the same kind, repo and branch, and no domain yet. It makes a new deploy key: add it to the repository as well.
3. Restore the database and `shared/` there as under "Restoring a backup for real", but keep the new server's `DATABASE_URL` line in `shared/.env`, because its password is the new server's.
4. `sudo rouh-app deploy notes`, and check it at its sslip.io address.
5. Point the domain's DNS at the new server, then `sudo rouh-app new notes --domain notes.example.com` there.
6. Once it answers on the new server, on the old one: `sudo rouh-app remove notes --yes`, which takes away its services and address and keeps its folder, renamed with the date, until it is no longer wanted. Add `--drop-database` only once the move is proved.
7. Take the old deploy key off the repository.

## Apps that are not on an apps server yet

The Apps Dashboard in Rouh lists two kinds that are apps but do not run on an apps server, and a plan for moving each; nothing is moved until the person says so.

- **An app that already runs elsewhere**, such as one made before Apps on a server of its own: it is listed with its address and where its data is kept, and checked by its address every five minutes. To move it, follow "Moving an app to another server" above: back up its database and files, `new` on the apps server, restore, test it on its test copy, point its address at the new server, then stop the old one.
- **A workspace page that keeps data of its own on Rouh**: a page with a list shared by everyone who may change it, or a person's choices stored for it (`rouh/sharedlist.py`, `rouh/pagestate.py`), kept in Rouh's own database. To move one, make it a small app on the standard: its page becomes the app's front, its data becomes the app's own database (its rows in Rouh's `page_shared_lists` and `page_states`, found by the page's path, copied in by the app's first migration), the app is deployed with `new` and `deploy`, and the workspace page stays where it was, linking to the app's address.

## When an app grows big

The apps on one server share its memory, processor and disk, and each has a memory limit so one cannot starve the rest.
When an app needs more than its limit, or the server's report shows memory or disk running short, there are two ways:

- Give it a bigger limit with `sudo rouh-app new notes --memory 1G` (and a bigger server if the server is full).
- Give it a server of its own: set up a second apps server in Rouh, and move the app there as above. Nothing about the app changes but where it runs.

## Where to look when something is wrong

- `sudo rouh-app status` and `sudo rouh-app logs <name>` first.
- `journalctl -u rouh-apps-agent` for what the agent did and what Rouh sent it.
- `journalctl -u caddy` when an address does not answer or has no certificate. A sslip.io address needs ports 80 and 443 open at the host as well as on the server; some hosts have a firewall of their own in their control panel.
- `/var/log/rouh-apps-setup.log` for the setup.
- `systemctl list-timers rouh-apps-backup.timer` for when the backups run next.
