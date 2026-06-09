## Temporal Lens v0.1.0 — First public release

Ever almost replied to a "see you tomorrow!" message that turned out to be 8 months old? This fixes that.

Temporal Lens annotates relative time references on web pages with what they actually resolve to, anchored to when the message was originally posted. "next Friday" reads as "(in 4 days)" the day it was written, and "(7 months ago)" when you find it later.

### What's in this release
- Fully local, deterministic time-reference detection. No AI, no API key, no accounts, no network calls.
- Works on Discord, Slack, and general websites.
- Live-refreshing annotation chips that stay accurate as time passes.
- Handles tomorrow, yesterday, today, tonight, this/next/last weekday, in N days/weeks/hours, N days/weeks ago, this weekend, EOD/EOW, next/last week, next/last month, and explicit calendar dates (ISO, numeric, and written).
- Original page text is preserved. It annotates, never rewrites.
- Configurable confidence threshold, medium-confidence toggle, per-platform toggles, and accent color.
- IndexedDB caching with a 7-day TTL.

### Privacy
Temporal Lens collects nothing and sends nothing anywhere. Your message text never leaves your browser.

### Install
Download `temporal-lens-0.1.0.zip` below and unzip, or clone the repo. Then open chrome://extensions (or edge://extensions), enable Developer Mode, click Load unpacked, and select the extension folder.

### Known limitations
- Local extractor focuses on common English expressions; unusual phrasings may be missed.
- Highly customized sites may need dedicated selectors for best results.

Feedback and pattern contributions welcome via Issues.
