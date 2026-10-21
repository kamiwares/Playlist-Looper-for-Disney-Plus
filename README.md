<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Playlist Looper for Disney+ icon">
</p>

<h1 align="center">Playlist Looper for Disney+</h1>

<p align="center">
  Your own playlist of Disney+ movies and episodes, played on repeat.
</p>

<p align="center">
  <a href="manifest.json"><img src="https://img.shields.io/github/manifest-json/v/kamiwares/Playlist-Looper-for-Disney-Plus?label=version&color=0063e5" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/kamiwares/Playlist-Looper-for-Disney-Plus?color=blue" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Chrome-111%2B-4285F4?logo=googlechrome&logoColor=white" alt="Chrome 111+">
  <img src="https://img.shields.io/badge/languages-EN%20%7C%20PL-informational" alt="Languages: English, Polish">
  <img src="https://img.shields.io/badge/dependencies-none-brightgreen" alt="No dependencies">
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome"></a>
  <a href="https://github.com/kamiwares/Playlist-Looper-for-Disney-Plus/commits/main"><img src="https://img.shields.io/github/last-commit/kamiwares/Playlist-Looper-for-Disney-Plus" alt="Last commit"></a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#playlist-json">Playlist JSON</a> ·
  <a href="#autostart">Autostart</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#contributing">Contributing</a>
</p>

Build a list, reorder it however you like, press **Start**. When an item ends, the next one starts. After the last item, it goes back to the first.

> [!NOTE]
> This is the Disney+ edition of [Playlist Looper for Netflix](https://github.com/kamiwares/Playlist-Looper-for-Netflix). The interface is available in English and Polish and follows your browser's language. New translations are welcome, see [Contributing](#contributing).

## Features

- **Build a playlist**: add the title you're watching with one click, either from the player page or the popup, or paste a Disney+ link or ID.
- **Edit it**: reorder by drag and drop or ↑/↓ buttons, rename items, remove them.
- **Loop modes**: repeat the whole list, repeat a single item, or play once and stop. Optional shuffle.
- **Always from the beginning**: Disney+ resumes where you left off; this option restarts every item from 0 instead.
- **Skip the credits**: move on *N* seconds before the end.
- **Fullscreen across items**: the whole Chrome window goes fullscreen and stays that way between titles. Press Esc or F11 to leave.
- **Self-healing playback**: if a title gets stuck loading, the extension tries to start it, reloads the page (up to 3 times) and finally skips it, so the loop keeps going.
- **Autostart**: open `disneyplus.com/#autostart` (e.g. from the Windows Startup folder) and the loop starts on its own.
- **Backup**: export and import the playlist as JSON.
- **Status at a glance**: a `2/5` counter on the toolbar icon and a loop badge on the player page.

## Installation

The extension isn't on the Chrome Web Store yet. To install it from source:

1. Download the code: `git clone https://github.com/kamiwares/Playlist-Looper-for-Disney-Plus.git`, or use **Code → Download ZIP** and unzip it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right corner).
4. Click **Load unpacked** and select the project folder.

Works in Chrome 111+ and other Chromium-based browsers (Edge, Brave, Opera). You need your own Disney+ subscription.

## Usage

1. Open a movie or an episode on Disney+ (a `disneyplus.com/play/…` page).
2. Click **Add to loop** on the page, or **Add current title** in the extension popup.
3. Repeat for the other titles and arrange them in the popup.
4. Press **Start**. To start from a specific item, click it in the list.

Options in the popup under **Settings**: loop mode, shuffle, fullscreen, always from the beginning, the Disney+ profile for autostart and the credits-skip offset.

## Playlist JSON

Instead of adding titles one by one, you can paste a whole playlist as JSON: open **Backup** in the popup, paste the JSON into the text field and click **Import (replace)**. **Export** produces the same format, which makes it an easy way to back up a playlist or move it to another computer.

The JSON is a list of items in play order. Each item has the Disney+ `id` and, optionally, a `title`:

```json
[
  { "id": "f63db666-b097-4c61-99c1-b778de2d4ae1", "title": "My favourite movie" },
  { "id": "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0", "title": "Series · S1:E1 Pilot" },
  { "id": "1a2b3c4d-5e6f-7081-92a3-b4c5d6e7f809" }
]
```

**Finding the ID:** start the movie or the episode on Disney+ and copy the ID from the address bar: `disneyplus.com/play/`**`f63db666-b097-4c61-99c1-b778de2d4ae1`**. For a series, start the specific episode, because each episode has its own ID. Series and movie pages (`/browse/entity-…`) aren't playable links, so they can't be added.

**Rules:**

- **`id`** is required. It can be the ID itself or a full Disney+ player link (`/play/…` or the older `/video/…`, with or without a locale such as `/pl-pl/`). The extension extracts the ID from the link.
- **`title`** is optional and only changes what the playlist shows. Without it, the item appears as `Disney+ #<start of id>` and the real title fills in automatically after it plays for the first time.
- **Shorthand:** a plain list of IDs or links also works, e.g. `["f63db666-b097-4c61-99c1-b778de2d4ae1", "https://www.disneyplus.com/play/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0"]`.
- **Clean-up:** duplicates and entries without a recognizable ID are skipped.
- **Import replaces the current playlist.** Export it first if you want to keep it.

## Autostart

Open `https://www.disneyplus.com/#autostart` and the loop starts right away in that tab, resuming from the last item. The `#autostart` marker is removed from the address, so reloading the page doesn't restart the loop.

To start the loop together with Windows, put a shortcut to that link in your Startup folder (press <kbd>Win</kbd>+<kbd>R</kbd>, type `shell:startup`, then *New → Shortcut* and paste the link). It opens in your default browser, so Chrome has to be the default browser with the extension installed in the profile it opens.

If your Disney+ account has several profiles, Disney+ may ask *Who's watching?* first. To skip it, enter the profile name under **Settings → Disney+ profile for autostart**: the extension then clicks that profile on its own and starts the loop. Leave the field empty to pick the profile yourself. PIN-locked profiles still ask for the PIN.

## How it works

| File | Role |
| --- | --- |
| `content.js` | Runs on disneyplus.com. Watches the player's `<video>` element and timeline and reports when a title ends. Also shows the on-page button and badge and runs the loading watchdog. |
| `background.js` | Service worker. Holds the loop state, picks the next item and navigates the loop tab to `disneyplus.com/play/<id>`. |
| `popup.*` | Playlist editor and settings. |
| `shared/storage.js` | Storage helpers and Disney+ link parsing, shared by the service worker, the popup and the content script. |

A title counts as finished when any of these happens:

- the `ended` event fires;
- playback reaches the "N seconds before the end" threshold;
- the Disney+ "Up next" overlay appears;
- Disney+ navigates away by itself after more than 85% of the title was watched.

The Disney+ stream doesn't expose its length and `video.currentTime` is offset from the title's timeline, so the position is read from the player's timeline slider whenever the controls are visible and followed through `video.currentTime` in between.

Disney+ has no URL parameter to start from the beginning, so with **Always from the beginning** on, the loop tab seeks a resumed title back to 0 when it starts. It does so by clicking the start of the player's own timeline: setting `video.currentTime` directly stalls the Disney+ player.

All data (playlist, settings, loop state) lives in `chrome.storage.local`.

## Privacy

- No data leaves your browser. No analytics, no tracking, no external servers.
- **Permissions:** `storage` saves your playlist, and access to `disneyplus.com` lets the extension detect the end of a video and navigate between titles.
- The extension doesn't download, record or decrypt anything. Playback is Disney+'s regular player.

## Limitations

- Disney+ can change its page structure at any time. Video end detection is based on the standard `<video>` element and should keep working. Title detection and the "Up next" detection use Disney+-specific markup and may break.
- Only player links (`/play/<id>`) can be added; series and movie pages can't.
- Disney+ pauses playback while its tab is in the background, so keep the loop tab visible (e.g. in its own window or fullscreen).
- Disney+ doesn't support playback in mobile browsers, and mobile Chrome doesn't support extensions, so this is desktop only.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and conventions.

## License

[MIT](LICENSE) © kamiwares

UI icons in `icons/fa/` come from [Font Awesome Free](https://fontawesome.com) by Fonticons, Inc. and are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The SVG files are unmodified and keep their license header.

## Disclaimer

This is an independent, unofficial project. It is not affiliated with, endorsed by or sponsored by Disney or Disney+. "Disney+" is a trademark of Disney Enterprises, Inc. and is used here only to describe what the extension works with.
