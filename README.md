<img width="1772" height="524" alt="Retro JD-XI Remote Synth Banner" src="https://github.com/user-attachments/assets/5bbbf0cc-18fa-4696-aebb-1d595308bffb" />
# Webapp also available without install for all platforms:
# https://jdxi-remote.wasmer.app/

# JD-Xi Remote for Android
Download is under [releases](https://github.com/quadpunk/JD-XI-Remote/releases)

Freeze issue? Remember to use Generic USB setting on JD-XI

**A powerful MIDI controller, sound editor, performance tool and step sequencer for the Roland JD-Xi synthesizer.**

JD-Xi Remote brings deeper control of the Roland JD-Xi to your Android phone or tablet. Edit sounds, control effects, manage patches, create sequences and perform live using an interface designed to make the JD-Xi more accessible and enjoyable.

<img width="2664" height="2664" alt="1794056801101" src="https://github.com/user-attachments/assets/f773ddb4-96bf-4a07-927b-c616f8f5698e" />

The app communicates directly with the synthesizer over USB MIDI, using standard MIDI messages and Roland SysEx for detailed parameter control.

Whether you're designing sounds, building patterns or performing live, JD-Xi Remote gives you more hands-on control without constantly navigating the synthesizer's small display and menus.

## Features

### Synthesizer & Sound Editor

Explore and edit the JD-Xi's sound engine through a visual interface.

- Control Digital Synth 1, Digital Synth 2 and Analog Synth parts.
- Read the currently active sound directly from the JD-Xi.
- Edit oscillator, filter, amplifier and LFO parameters.
- Adjust cutoff, resonance and envelope settings.
- Access detailed ADSR controls.
- Edit individual digital partials or link partials together.
- Access advanced sound parameters through the full parameter editor.
- Send parameter changes directly to the synthesizer using MIDI SysEx.
- Edit arpeggio settings.
- Play and audition sounds using the on-screen keyboard.

The editor provides both simplified controls for quick adjustments and advanced editing for detailed sound design.

###  Mixer & Effects

Control your JD-Xi's mix and effects without navigating through hardware menus.

- Adjust levels for individual synthesizer parts.
- Read current mixer settings from the connected JD-Xi.
- Control effect parameters from the dedicated FX interface.
- Make adjustments while playing.
- Optionally retain your preferred mixer settings when switching patterns.

Designed for quick adjustments during sound design, rehearsals and live performance.

### Native 4-Track Step Sequencer

JD-Xi Remote includes a native Android step sequencer, built with Kotlin and Jetpack Compose.

The sequencer follows the JD-Xi's four-part architecture:

| Track | MIDI Channel |
|---|---|
| Digital Synth 1 | 1 |
| Digital Synth 2 | 2 |
| Drums | 10 |
| Analog Synth | 3 |

**Sequencer features:**

- 16, 32, 48 or 64 steps.
- Piano-roll style note editing.
- Dedicated drum grid with JD-Xi drum sounds.
- Adjustable note velocity and duration.
- Tempo control from 40 to 240 BPM.
- Swing adjustment.
- Individual track mute controls.
- Play and stop controls.
- Optional MIDI clock and transport synchronization.
- Eight local pattern memory slots.
- Automatic local storage of the current sequence.
- Ability to send sequencer playback to the JD-Xi for recording into its internal pattern sequencer.

Create musical ideas on your phone or tablet and hear them immediately through the connected synthesizer.

### Live Performance & Pattern Launcher

The Performance section is designed for playing and arranging JD-Xi patterns live.

Assign up to six JD-Xi programs to performance slots and switch between them during playback.

Features include:

- Six configurable pattern slots.
- Visual indication of the current and next pattern.
- Queued pattern changes synchronized with musical timing.
- Pattern transitions at the end of the current pattern.
- Adjustable tempo and timing options.
- MIDI clock synchronization.
- Support for either app-generated clock or following the JD-Xi's clock.
- MIDI panic / all-notes-off function.

This makes it possible to create longer musical arrangements from existing JD-Xi patterns and move between sections during a live performance.

### Patch Management

Manage your own sounds directly from the app.

- Read the current JD-Xi sound.
- Save custom patches locally.
- Name and organize your sounds.
- Mark favorite patches.
- Search and filter saved sounds.
- Restore saved patches to the synthesizer.
- Export patch collections as JSON files.
- Import previously saved patch collections.

Experiment with sound design while keeping a personal collection of your favorite patches.

### 🔄 Yamaha DX7 Patch Import

Explore classic FM synthesizer sounds with the integrated DX7 import tool.

- Import Yamaha DX7 `.syx` files.
- Support for individual voices and 32-voice banks.
- Inspect the structure of imported DX7 sounds.
- Convert selected voice characteristics into JD-Xi-compatible digital tone parameters.
- Transfer the resulting tone to the JD-Xi's temporary sound memory.

**Note:** The Yamaha DX7 and Roland JD-Xi use fundamentally different synthesis architectures. Imported DX7 sounds are approximations rather than exact reproductions.

The feature provides an interesting starting point for creating new sounds inspired by classic FM patches.

### 🎶 MIDI Player

A dedicated MIDI Player section provides additional ways to work with MIDI material and the connected synthesizer.

### Audio Visualizer

The Remote interface includes a visualizer for displaying animated audio-related graphics.

- Multiple visualization modes.
- Start and stop the visualizer independently.
- Full-screen visualization.
- Optional audio analysis using a supported audio input.
- Visual feedback while performing.

Audio-based visualization depends on the availability of a compatible audio input and Android permissions.

### Customizable Interface

JD-Xi Remote offers several visual themes:

- Android
- Cybergreen
- Studio Keys
- Pocket LCD
- Dark
- Light
- Ocean

The interface is designed for use on Android phones and tablets, with dedicated layouts for different screen sizes.

## USB MIDI Connection

JD-Xi Remote communicates with the synthesizer through a direct USB connection.

**Requirements:**

- Android device running Android 7.0 or newer.
- Roland JD-Xi synthesizer.
- USB cable and USB-OTG adapter, or a compatible USB-C connection.
- Android device with USB host support.

The JD-Xi may need to be configured to use its generic USB MIDI driver mode.

Once connected, the app can exchange MIDI messages with the synthesizer, including Roland SysEx messages for detailed sound editing.

## How the App Works

JD-Xi Remote combines two technologies in one Android application.

**Remote interface**

The sound editor, performance tools, mixer and other controller functions use an embedded web-based interface running inside an Android WebView.

A custom MIDI bridge connects the interface to Android's native MIDI API, allowing communication with the JD-Xi, including SysEx messages.

**Native sequencer**

The four-track step sequencer is implemented natively in Kotlin using Jetpack Compose.

It communicates with the synthesizer through the same underlying USB MIDI connection.

This hybrid design combines a flexible editing interface with native Android sequencing functionality.

## Who Is It For?

JD-Xi Remote is designed for:

- **Sound designers** who want easier access to synthesizer parameters.
- **Live performers** who want convenient pattern switching and mixer control.
- **Electronic musicians** creating sequences, beats and arrangements.
- **JD-Xi enthusiasts** who want to explore more of their synthesizer's capabilities.
- **Musicians using phones or tablets** as additional controllers in their hardware setup.

The application is intended as a companion to the physical Roland JD-Xi synthesizer, not as a software synthesizer replacement.

## Compatibility

**Supported synthesizer:** Roland JD-Xi

**Platform:** Android 7.0+

**Communication:** USB MIDI and Roland System Exclusive (SysEx)

**Interface:** Android WebView and native Jetpack Compose

Some features require an active connection to the synthesizer. Functionality may depend on the Android device, USB implementation and JD-Xi configuration.

## Project Status

JD-Xi Remote is an independently developed project.

The application is intended for experimentation, music production, sound design and live performance. Features and compatibility may evolve as development continues.

Feedback, bug reports and feature suggestions are welcome through GitHub Issues.

## Disclaimer

JD-Xi Remote is an independent, unofficial application and is not affiliated with, endorsed by or sponsored by Roland Corporation.

Roland and JD-Xi are trademarks of Roland Corporation. Yamaha and DX7 are trademarks of Yamaha Corporation.

All trademarks belong to their respective owners.

---

**JD-Xi Remote — More control. More creativity. More from your JD-Xi.**


## Interface size (v37)
Use **Size** next to Appearance to select Auto or 50–150% in 10% increments. Auto uses the screen-responsive layout and is the default. The choice persists locally.
