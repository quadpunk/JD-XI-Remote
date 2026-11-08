# JD-Xi menu vs MIDI capability audit

Sources: Roland [Owner's Manual](https://static.roland.com/assets/media/pdf/JD-Xi_eng06_W.pdf), [Parameter Guide](https://cdn.roland.com/assets/media/pdf/JD-Xi_ParameterGuide_e01_W.pdf), and [MIDI Implementation v1.00](https://cdn.roland.com/assets/media/pdf/JD-Xi_MIDI_Imple_e01_W.pdf), especially the Parameter Address Map pp. 8–9.

The web **System / SysEx** screen intentionally exposes **only** documented SysEx-addressable System Common and System Controller parameters. Each control starts disabled and is unlocked by a valid DT1 readback after an RQ1 request. Values are constrained to Roland's published ranges.

| JD-Xi menu concept | MIDI address | Web control |
| --- | --- | --- |
| SOUND / Master Key Shift | 02 00 00 04 | Yes |
| SOUND / Master Level | 02 00 00 05 | Yes |
| MIDI / Program Control Channel | 02 00 00 11 | Yes |
| MIDI / Receive Program Change | 02 00 00 29 | Yes |
| MIDI / Receive Bank Select | 02 00 00 2A | Yes |
| CONTROLLER / Transmit Program Change | 02 00 03 00 | Yes |
| CONTROLLER / Transmit Bank Select | 02 00 03 01 | Yes |
| CONTROLLER / Keyboard Velocity | 02 00 03 02 | Yes |
| CONTROLLER / Keyboard Velocity Curve | 02 00 03 03 | Yes |
| CONTROLLER / Keyboard Velocity Curve Offset | 02 00 03 04 | Yes |
| SOUND / Master Tune | 02 00 00 00, four nibbles | Documented but omitted pending multi-nibble editor |
| GENERAL / LCD Contrast, Illumination | Not mapped in MIDI implementation | Hardware only |
| INPUT / noise suppressor and microphone settings | Not mapped in MIDI implementation | Hardware only |
| MIDI / Local Switch, Tx Edit Data, USB Driver, Sync Mode | Not mapped as writable system addresses in implementation v1.00 | Hardware only |
| Utility / Backup, Restore, Factory Reset | No MIDI remote commands documented | Hardware only |
| Menu navigation buttons | No MIDI remote commands documented | Hardware only |

Other documented *program and tone* parameters are edited on the Synth screen; they are not system settings. Program tempo and transport have dedicated MIDI controls elsewhere in the app.

**Important:** No physical JD-Xi hardware verification has been performed. Reading/writing system parameters should be tested carefully; the UI does not emulate physical menu button presses or save/commit actions beyond the instrument's own behavior.
