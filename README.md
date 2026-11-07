# JD-Xi Remote (Android)

* **Remote** tab: your web app (assets/web, includes the visualiser start/stop fix) running in a WebView, exactly as in the browser.
  `android-midi.js` provides `navigator.requestMIDIAccess` on top of Android's MIDI API (SysEx always allowed), so the page needs no changes.
* **Sequencer** tab: native 4-track step sequencer (Sequencer.kt / SequencerScreen.kt) using the same USB MIDI connection.

## Build locally
1. Open this folder in Android Studio (Koala or newer). It downloads Gradle 8.9 and the SDK 35 platform on first sync.
2. Connect the JD-Xi with a USB-OTG cable (JD-Xi USB driver setting: GENERIC on the synth, if it has such a menu).
3. Run, or Build > Build APK(s).

## Updating the web part
Replace the files in app/src/main/assets/web (from the JD-Xi-Remote-cleaned web folder with the Arpeggio category). Keep `android-midi.js` and the `<script src="./android-midi.js">` line first in `<head>` of index.html.

## Build on GitHub (no Android Studio needed)
The workflow `.github/workflows/android.yml` builds the app on every push, pull request and manual run.

1. Create a repository and push the **contents of this folder** (the folder that contains `settings.gradle.kts` and `.github/`).
2. Open the **Actions** tab, pick *Build Android app* (or push a commit). When it is green, open the run and download the artifact
   **JdxiRemote-apk**. It contains `JdxiRemote-debug.apk`, which installs directly on the phone (allow "install unknown apps").
3. **Release page:** push a tag such as `v1.0` (`git tag v1.0 && git push --tags`). The APKs are then attached to a GitHub Release.

### Optional: signed release APK
Without a signature only the debug APK is produced. To also get `JdxiRemote-release.apk`, add four repository secrets
(Settings > Secrets and variables > Actions):

| Secret | Value |
| --- | --- |
| `KEYSTORE_BASE64` | your keystore file as base64: `base64 -w0 release.jks` |
| `KEYSTORE_PASSWORD` | keystore password |
| `KEY_ALIAS` | key alias |
| `KEY_PASSWORD` | key password |

Create a keystore once with: `keytool -genkeypair -v -keystore release.jks -alias jdxi -keyalg RSA -keysize 2048 -validity 10000`
and keep it safe (never commit it; `.gitignore` already excludes `*.jks`).

The same build works on your own machine with `gradle assembleDebug` (Gradle 8.9, JDK 17, Android SDK 35); the APK ends up in `app/build/outputs/apk/debug/`.
