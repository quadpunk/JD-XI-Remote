# Android v41 – native theme parity

- Fixed the Android-only **native Step Sequencer** falling back to the `droid` palette for **KO Light** and **KO Dark**.
- Added Compose palettes for `ko-light` and `ko-dark` in `Theme.kt`, mapped to v39 web UI colors and contrast.
- Preserved the embedded v39 WebView pages, theme selectors, native MIDI engine, 16 Punch In effects, ARP controls, scale control, and existing license files.
- Added `tools/check_theme_parity.py` to verify every Appearance menu value has a corresponding native palette; run `python3 tools/check_theme_parity.py`.

## Validation limits

This is source code, not an APK. The parity check and static JavaScript checks pass. A real Android build and physical-device/USB-MIDI testing were not performed. For KO Dark and KO Light, open Step Sequencer after switching Appearance and compare its panel and grid colors to the other pages.
