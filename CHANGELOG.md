# Changelog

Every release of Rouh's code, newest first, written by itself from each signed release
(`deploy/container/code_release_mirror.py`). The last part of a number goes up for an ordinary
release, the middle one for a release that changes the database or an installation's settings.
Each release is also a GitHub Release, tagged `v<number>`, carrying `code-release.json`: the signed
file rouh.land serves at /mac/code/release.json, which a Rouh checks before it takes it.

## Rouh 1.1.4 - 27 November 2026

Commit `cb7b99ea179a`.

- Rouh: See it on a phone closes on Escape while the framed page holds the keyboard
- Rouh: night 56 - a run's brief carries Rouh's latest errors, a broken screen says so, See it on a phone, Save it for the next run; chat ready once a key is saved, Rouh on a phone's home screen, Save this chat as a file, Type / for what you can do
- Devices: Rouh never answers its own voice heard back through the room's speaker
- Robot chat: the Echo stays connected and comes back by itself; Rouh never answers its announcement
- Robot chat: Rouh's voice plays through a connected Bluetooth speaker, such as the Echo

## Rouh 1.1.3 - 26 November 2026

Commit `32f20780b082`.

- Robot chat: Rouh turns the robot's voice louder or quieter when asked (robot_volume)
- Robot chat: Rouh's voice plays through a connected Bluetooth speaker, such as the Echo

## Rouh 1.1.2 - 26 November 2026

Commit `d8352e9cb9a0`.

- Robot chat: the rules say the listening light's slider is on a curve, at 1, the faintest glow
- Robot chat: the rules say the listening light is at 1 percent, the minimum, not 30
- Robot chat: the rules say the head follows a face in one smooth movement, by itself, and never the wheels
- Projector: the Robot Chat full screen on a wall, shown by a Raspberry Pi on a key of its own
- Robot chat: the rules say the listening light is dimmed, at 30 percent unless changed, and where it is changed
- Robot chat: the robot drives now, blocked only on its charging cable
- Robot chat: the rules say the robot's head tilts up and its light comes on by itself while it listens
- Robot: a Bluetooth tool, so the robot can be connected to by Bluetooth
- Robot chat: a spoken turn is answered as the owner, with full access

## Rouh 1.1.1 - 26 November 2026

Commit `4346b2c2ce9e`.

- Tests/stack: a task's notes are written only once Rouh has finished filing the task
- Base 1.0.22: charset-normalizer 3.5.2 -> 3.5.3; pyyaml 6.0.3 -> 6.0.4; 9 Debian security updates

## Rouh 1.1.0 - 26 November 2026

Commit `9493f679cb6c`. Changes the database: a Rouh saves a copy of it first. Changes an installation's settings.

- Updates: an update's run is not written down as over while Rouh starts again on a change
- Updates: the next change waits for Rouh to start again on the one it just took
- Llm: a model on your own server is asked to answer without thinking unless a level is picked
- Notifications: read a result whole in place, links go where they say, and a finished job is one result
- Tests/stack: Tests on main can pass again after the 25 November gap landings
- Thoughts: Memory-off chats say plainly why nothing is kept; jobs can keep a thought in the owner's words
- Releases of Rouh's code: a number like 1.1.0, signed, mirrored to GitHub, read from there when rouh.land is down
- Voice: Rouh speaks with Eleven v4 Turbo instead of Flash v2.5
- Keys: a speech-only ElevenLabs key saves a voice id, checked by speaking one word
- Links are shown whole: secrets are hidden by what they are, never by looking random
- Self-check: the bell counts every notification still to read, not only the week's
- Notifications: a page of their own at /notifications, opened by the bell
- And 96 smaller changes
