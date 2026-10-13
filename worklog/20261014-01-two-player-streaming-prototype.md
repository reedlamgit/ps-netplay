# Two-player streaming prototype

## Summary

Built and deployed the host/P2 flow at https://ps-pocket.vercel.app. Host loads their own PS1 game and BIOS locally, creates a room and shares its link. Guest receives live video/audio and uses touch/keyboard controls for the second controller port. Reused the existing Render signaling server without changing backend code.

Changed: `web/index.html`, `web/style.css`, `web/app.mjs`, `web/room.mjs`, `web/media.mjs`, `web/controls.mjs`, vendored Socket.IO browser client, three unit test files, and `docs/ps-pocket.md`.

## Problems

- Headless Chrome direct WebRTC loopback failed with mDNS-private candidates, independently of the app.
- Copying the host's whole wide canvas into a 4:3 stream distorted the game.
- Room disconnect handling disabled controls permanently after ICE recovered and left terminally failed peers alive.
- Muted guest playback initially reported zero decoded audio energy, so an audio-track presence alone was insufficient verification.
- Initial async reviewer failed; later Luna review could not attest source completeness due to tool-output truncation. No complete independent review is claimed.

## Solutions

- Test-only microphone permission exposed usable ICE candidates; no microphone request/capture in the application.
- Crop the native game viewport before scaling to 640×480, respecting core top-aligned portrait viewport.
- Restore open channels after ICE recovery; close peers and leave rooms on terminal failures; cancel pending wake/connect operations when leaving.
- Tap OpenAL source gain nodes and verify audio after guest presses Enable sound.
- Per-room random domain avoids a shared public room listing. Third joins are rejected by server capacity 2.

## Verification

- `node --test tests/*.test.mjs`: 13 passed, 0 failed.
- All `.mjs` files passed `node --check`.
- Real local CHD/BIOS booted on live Vercel.
- Two-browser production test: 640×480 guest video, decoded frames, P2 simultaneous touch press/release routed as `[1,4,1]`, `[1,0,1]`, `[1,4,0]`, `[1,0,0]`.
- Local two-browser audio test after enabling sound: decoded audio energy ~0.034, samples >980k.
- Third guest rejected; closing host room disables guest controls and does not stop host emulator.
- Portrait and landscape screenshots checked; game controller touch targets >=44 px; no portrait horizontal overflow.
- Screenshot evidence kept locally in `.playwright-cli/`; private game/BIOS not deployed or committed.

## Learnings

Browser tests prove the signaling/stream/control architecture, not sustained iPhone hosting performance. Microphone permission test workaround is specific to automated local ICE tests, not a production requirement. Use `window.EJS_emulator?.started` in readiness checks to avoid an early ReferenceError.

## Next

Test on the user's iPhone 17 and a second physical phone, initially on the same Wi-Fi. Confirm gameplay in the actual two-player game mode, touch usability, audio and sustained latency/thermal behavior. TURN relay and P3/P4 multitap remain out of scope.
