#!/usr/bin/env python3
"""Check that all Web Appearance theme values have native Compose palettes."""
from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
html = (root / "app/src/main/assets/web/index.html").read_text()
kt = (root / "app/src/main/java/com/quadpunk/jdxi/Theme.kt").read_text()
menu = re.search(r'<select id="theme"[^>]*>(.*?)</select>', html, re.S)
if not menu:
    raise SystemExit("Appearance select not found")
web = set(re.findall(r'<option value="([a-z0-9-]+)"', menu.group(1)))
native = set(re.findall(r'"([a-z0-9-]+)"\s+to\s+Palette\(', kt))
missing = web - native
if missing:
    raise SystemExit(f"Missing native palettes: {sorted(missing)}")
print("PASS: all", len(web), "Appearance options have native Compose palettes:", ", ".join(sorted(web)))
