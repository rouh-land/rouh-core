# Rouh on a projector, with a Raspberry Pi

A Raspberry Pi behind a projector with no wireless of its own, plugged into its HDMI, shows the owner's Robot Chat full screen from power on (`rouh/projector.py`).
Made for a Raspberry Pi 3 (1 GB of memory, 2.4 GHz Wi-Fi) running Raspberry Pi OS Lite; any later Pi works the same way.

## What the person does

The setup page, `/projector/setup` in Rouh, says it in four steps:

1. Write Raspberry Pi OS Lite (64-bit) to the SD card with Raspberry Pi Imager, skipping its settings.
2. Type the Wi-Fi name and password on the setup page and press Download the setup file.
3. Drag the downloaded `user-data` onto the card's `bootfs` drive, replacing the one there.
4. Put the card in the Pi, HDMI to the projector, then power.

## What the files here do

- `user-data.template` is a cloud-init file (the first-start settings Raspberry Pi OS reads from the SD card since Trixie). Rouh fills in its address, a display key made for this one Pi, and `install.sh`; the setup page fills in the Wi-Fi name, password and country and the time zone in the person's own browser, so the Wi-Fi password never reaches Rouh.
- `install.sh` runs at the first start, and at every start after until it has finished once: it joins the Wi-Fi (power saving off), installs cage (a compositor that shows one program full screen with no desktop) and Chromium, and starts `rouh-projector.service`, which waits until Rouh answers and opens `/projector#key=...` in kiosk mode. The service starts again by itself if it stops, the browser starts afresh at 04:30 every night, and the console never blanks. Its log is `/var/log/rouh-projector-install.log` on the Pi.

## The key

A display key (`rouh/devices.py`, kind `display`) reads `/api/projector/feed` and `/api/projector/image` and nothing else; the WebSocket refuses it.
Only its hash is kept. Making a new setup file ends the old key, and Turn off this projector on the setup page ends it at once.
