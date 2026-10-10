<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Playlist Looper for Netflix icon">
</p>

<h1 align="center">Playlist Looper for Netflix</h1>

<p align="center">
  Your own playlist of Netflix movies and episodes, played on repeat.
</p>

<p align="center">
  <a href="manifest.json"><img src="https://img.shields.io/github/manifest-json/v/kamiwares/netflix?label=version&color=e50914" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/kamiwares/netflix?color=blue" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Chrome-111%2B-4285F4?logo=googlechrome&logoColor=white" alt="Chrome 111+">
  <img src="https://img.shields.io/badge/languages-EN%20%7C%20PL-informational" alt="Languages: English, Polish">
  <img src="https://img.shields.io/badge/dependencies-none-brightgreen" alt="No dependencies">
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome"></a>
  <a href="https://github.com/kamiwares/netflix/commits/main"><img src="https://img.shields.io/github/last-commit/kamiwares/netflix" alt="Last commit"></a>
</p>

<p align="center">
  <a href="#screenshots">Screenshots</a> ·
  <a href="#features">Features</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#playlist-json">Playlist JSON</a> ·
  <a href="#autostart">Autostart</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="docs/screenshots/mockup.png" width="720" alt="Playlist Looper for Netflix on a laptop: the popup with a playlist next to the on-page loop controls">
</p>

Build a list, reorder it however you like, press **Start**. When an item ends, the next one starts. After the last item, it goes back to the first.

> [!NOTE]
> The interface is available in English and Polish and follows your browser's language. New translations are welcome, see [Contributing](#contributing).

## Screenshots

<table>
  <tr>
    <td align="center" valign="top"><img src="docs/screenshots/popup.png" width="300" alt="Popup with a playlist, the current item highlighted"><br><sub>Playlist in the popup</sub></td>
    <td align="center" valign="top"><img src="docs/screenshots/popup-settings.png" width="300" alt="Popup with the settings section expanded"><br><sub>Settings</sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/screenshots/player.png" width="620" alt="On-page loop badge, fullscreen and playlist buttons, and a notice about a skipped item"><br><sub>On-page controls and notices on the player page</sub></td>
  </tr>
</table>

<sub>The screenshots use sample titles. The player view is a mockup with a neutral background instead of a video frame.</sub>

## Features

- **Build a playlist**: add the title you're watching with one click, either from the player page or the popup, or paste a Netflix link or ID.
- **Edit it**: reorder by drag and drop or ↑/↓ buttons, rename items, remove them.
- **Loop modes**: repeat the whole list, repeat a single item, or play once and stop. Optional shuffle.
- **Skip the credits**: move on *N* seconds before the end.
- **Fullscreen across items**: the whole Chrome window goes fullscreen and stays that way between titles. Press Esc or F11 to leave.
- **Self-healing playback**: if a title gets stuck loading, the extension tries to start it, reloads the page (up to 3 times) and finally skips it, so the loop keeps going. It also dismisses the "Are you still watching?" prompt.
- **Autostart**: open `netflix.com/#autostart` (e.g. from the Windows Startup folder) and the loop starts on its own.
- **Backup**: export and import the playlist as JSON.
- **Status at a glance**: a `2/5` counter on the toolbar icon and a loop badge on the player page.

## Installation

The extension isn't on the Chrome Web Store yet. To install it from source:

1. Download the code: `git clone https://github.com/kamiwares/netflix.git`, or use **Code → Download ZIP** and unzip it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right corner).
4. Click **Load unpacked** and select the project folder.

Works in Chrome 111+ and other Chromium-based browsers (Edge, Brave, Opera). You need your own Netflix subscription.

## Usage

1. Open a movie or an episode on Netflix (a `netflix.com/watch/…` page).
2. Click **Add to loop** on the page, or **Add current title** in the extension popup.
3. Repeat for the other titles and arrange them in the popup.
4. Press **Start**. To start from a specific item, click it in the list.

Options in the popup under **Settings**: loop mode, shuffle, fullscreen, the Netflix profile for autostart and the credits-skip offset.

## Playlist JSON

Instead of adding titles one by one, you can paste a whole playlist as JSON: open **Backup** in the popup, paste the JSON into the text field and click **Import (replace)**. **Export** produces the same format, which makes it an easy way to back up a playlist or move it to another computer.

The JSON is a list of items in play order. Each item has the Netflix `id` and, optionally, a `title`:

```json
[
  { "id": "80000001", "title": "My favourite movie" },
  { "id": "80000002", "title": "Series · S1:E1 Pilot" },
  { "id": "80000003" }
]
```

**Finding the ID:** open the movie or the episode on Netflix and copy the number from the address bar: `netflix.com/watch/`**`80000001`**. For a series, open the specific episode, because each episode has its own ID. A series page ID (`/title/<id>`) adds the whole series as one item that resumes wherever Netflix last left off.

**Rules:**

- **`id`** is required. It can be the number itself, written with or without quotes, or a full Netflix link (`/watch/…`, `/title/…` or a link with `?jbv=…`). The extension extracts the ID from the link.
- **`title`** is optional and only changes what the playlist shows. Without it, the item appears as `Netflix #<id>` and the real title fills in automatically after it plays for the first time.
- **Shorthand:** a plain list of IDs or links also works, e.g. `["80000001", "https://www.netflix.com/watch/80000002"]`.
- **Clean-up:** duplicates and entries without a recognizable ID are skipped.
- **Import replaces the current playlist.** Export it first if you want to keep it.

## Autostart

Open `https://www.netflix.com/#autostart` and the loop starts right away in that tab, resuming from the last item. The `#autostart` marker is removed from the address, so reloading the page doesn't restart the loop.

To start the loop together with Windows, put a shortcut to that link in your Startup folder (press <kbd>Win</kbd>+<kbd>R</kbd>, type `shell:startup`, then *New → Shortcut* and paste the link). It opens in your default browser, so Chrome has to be the default browser with the extension installed in the profile it opens.

If your Netflix account has several profiles, Netflix may ask *Who's watching?* first. To skip it, enter the profile name under **Settings → Netflix profile for autostart**: the extension then clicks that profile on its own and starts the loop. Leave the field empty to pick the profile yourself. PIN-locked profiles still ask for the PIN.

## How it works

| File | Role |
| --- | --- |
| `content.js` | Runs on netflix.com. Watches the `<video>` element and reports when a title ends. Also shows the on-page button and badge and runs the loading watchdog. |
| `background.js` | Service worker. Holds the loop state, picks the next item and navigates the loop tab to `netflix.com/watch/<id>?t=0`. |
| `popup.*` | Playlist editor and settings. |
| `shared/storage.js` | Storage helpers shared by the service worker and the popup. |

A title counts as finished when any of these happens:

- the `ended` event fires;
- playback reaches the "N seconds before the end" threshold;
- Netflix's post-play screen appears;
- Netflix navigates away by itself after more than 85% of the title was watched.

The extension never sets `video.currentTime`, because that triggers Netflix error M7375. It only changes the page URL.

All data (playlist, settings, loop state) lives in `chrome.storage.local`.

## Privacy

- No data leaves your browser. No analytics, no tracking, no external servers.
- **Permissions:** `storage` saves your playlist, and access to `www.netflix.com` lets the extension detect the end of a video and navigate between titles.
- The extension doesn't download, record or decrypt anything. Playback is Netflix's regular player.

## Limitations

- Netflix can change its page structure at any time. Video end detection is based on the standard `<video>` element and should keep working. Title detection and the post-play detection use Netflix-specific attributes and may break.
- A series link (`/title/<id>`) adds the series as one item, which resumes wherever Netflix last left off. For a predictable loop, add individual episodes.
- Netflix doesn't support playback in mobile browsers, and mobile Chrome doesn't support extensions, so this is desktop only.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and conventions.

## License

[MIT](LICENSE) © kamiwares

UI icons in `icons/fa/` come from [Font Awesome Free](https://fontawesome.com) by Fonticons, Inc. and are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The SVG files are unmodified and keep their license header.

## Disclaimer

This is an independent, unofficial project. It is not affiliated with, endorsed by or sponsored by Netflix, Inc. "Netflix" is a trademark of Netflix, Inc. and is used here only to describe what the extension works with.
