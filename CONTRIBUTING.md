# Contributing

Thanks for your interest in Playlist Looper for Disney+! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs

Disney+ changes its site often, so the most useful bug reports include:

- your browser and its version;
- what you did, what you expected and what happened instead;
- errors from the service worker console (`chrome://extensions` → the extension → **Service worker**) and from the Disney+ tab console (F12). Look for messages that come from the extension's files; Disney+ itself logs a lot of unrelated warnings.

## Development setup

There is no build step and there are no dependencies. The code is plain JavaScript loaded directly by Chrome.

1. Fork and clone the repository.
2. Load the folder in `chrome://extensions` with **Developer mode** → **Load unpacked**.
3. After changing the code, click the reload icon (↻) on the extension card and reload the Disney+ tab.

Before opening a pull request, check the syntax:

```sh
node --check content.js
node --input-type=module --check < background.js
node --input-type=module --check < popup.js
node --input-type=module --check < shared/storage.js
```

## Conventions

- **Code style:** match the surrounding code. Two-space indentation, single quotes, semicolons, no frameworks or bundlers.
- **Disney+ specifics:** the real player `<video>` sits inside shadow DOM next to an empty placeholder in the light DOM, so look it up through `findVideo()`, not `document.querySelector`. Never seek by setting `video.currentTime`: the Disney+ player stalls on a black screen. Seek through its timeline slider (`.progress-bar__seekable-range`), as *Always from the beginning* does, and only on the loop tab. Treat Disney+ DOM selectors as fragile: use them as extra signals with a fallback, never as the only mechanism.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat: …`, `fix: …`, `docs: …`, `chore: …`.
- **Branches:** one feature or fix per branch, named like `feature/<name>` or `fix/<name>`, merged into `main` through a pull request.
- **Translations:** all UI text lives in `_locales/<language>/messages.json` ([`chrome.i18n`](https://developer.chrome.com/docs/extensions/reference/api/i18n)). To add a language, copy `_locales/en/messages.json` to `_locales/<code>/messages.json` and translate the `message` values; keep the keys and placeholders unchanged. In HTML, mark text with `data-i18n`, `data-i18n-title`, `data-i18n-placeholder` or `data-i18n-aria-label`; in scripts, use `t(key, ...substitutions)`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
