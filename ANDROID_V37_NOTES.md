# Android v37 — interface scaling

Adds a Size selector beside Appearance. Auto uses responsive CSS and is the default. Manual choices are 50% through 150% in 10% increments. The chosen value is saved in localStorage per Android WebView installation. The implementation uses CSS zoom on the body, not Android textZoom or transform scaling, preserving touch coordinates and allowing the layout to reflow. This changes only UI size, not MIDI logic.

Checks: JS syntax verified; ZIP integrity verified. Full Android build and actual-device layout/MIDI not tested.
