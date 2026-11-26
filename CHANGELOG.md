# Changelog

Every release of Rouh's code, newest first, written by itself from each signed release
(`deploy/container/code_release_mirror.py`). The last part of a number goes up for an ordinary
release, the middle one for a release that changes the database or an installation's settings.
Each release is also a GitHub Release, tagged `v<number>`, carrying `code-release.json`: the signed
file rouh.land serves at /mac/code/release.json, which a Rouh checks before it takes it.
