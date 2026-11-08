# JD-Xi Remote – Android v36

Complete Android Studio source project, based on `JD-XI-Remote-main (5).zip` and web app v36.

## New features
- KO-inspired, compact Performance layout, with MIDI PLAY/STOP and spring-return pitch/mod wheels plus part selector.
- 16 Punch In effects (eight original plus eight new variants).
- Independent D1, D2, Analog and Drums arpeggiator-zone buttons, reading their actual JD-Xi status.
- Updated MIDI editor and Performance timing fixes from the web release, plus stable two-line status display.

## Preserved native functionality
- Native Android USB MIDI bridge (`android-midi.js`, `MidiEngine.kt`, `WebMidiBridge.kt`).
- Existing native Android Step sequencer (Kotlin Compose UI).
- Android file exports (`transfer.js` and bridge download callback).
- Android theme binding, full WebView asset loading and existing Gradle configuration.

## Build
1. Open this directory as a project in Android Studio.
2. Let Gradle sync, then Build > Build APK(s), or run on an Android device.
3. Connect a JD-Xi with USB OTG/USB MIDI, grant MIDI access, test connection and SysEx readback.
4. Test each ARP zone against the physical synth, check MIDI output channels for the wheels, and test Punch In note release carefully before live use.

## Verification
All referenced web scripts exist and passed `node --check`. The source ZIP passes a CRC check. A full Android/Gradle build and real USB-MIDI device test may depend on local Android SDK and a physical JD-Xi; see the accompanying report.
