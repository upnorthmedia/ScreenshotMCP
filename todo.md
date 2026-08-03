# TODO

## Fixed

- [x] [confirmed] 2026-08-03 — Windows `Protocol error: Connection closed` on capture (issue #2). Root cause: `--single-process` + no relaunch when `browser.connected` is false. Fixed in `src/screenshot.js`; covered by `src/screenshot.test.js`.
