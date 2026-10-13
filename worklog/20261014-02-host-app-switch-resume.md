# Host app-switch recovery

## Summary

User reported that switching from the iPhone browser to WhatsApp to share a room link left the game frozen on return. Added explicit user-gesture recovery and native sharing, deployed at https://ps-pocket.vercel.app.

## Problems

`pagehide` previously called `stopRoom()` and revoked the BIOS URL. Foreground handling only reacquired a wake lock; it did not wake the core/runtime loops or interrupted audio. Physical iOS audio/graphics behavior remains device-dependent.

## Solutions

- Blur, hidden visibility and pagehide release controls and mark/pause the host, without explicitly tearing down rooms or local BIOS resources.
- Returning shows **Resume game**. Its tap synchronously requests audio resume, plays the emulator, wakes core and Emscripten loops, and restores focus. No game restart is used.
- Bounded wait prevents blocked audio from indefinitely hanging recovery. Lost graphics context or discarded emulator reports a reload requirement.
- Added native **Share** where supported and retained Copy link.
- Clearly report if the room disconnected while away; do not claim continuous background streaming.

Changed: `web/lifecycle.mjs`, `web/app.mjs`, `web/index.html`, `web/style.css`, `tests/lifecycle.test.mjs`, docs.

## Verification

17 unit tests pass. Browser test with the user's real local CHD/BIOS deliberately paused the runtime, suspended audio, and dispatched pagehide/pageshow. Resume restored the same emulator object (no reload), paused=false and audio=running, preserving the room link. Subsequent screenshot showed the game rendering. A production test repeated blur/focus with runtime/audio suspension and successfully resumed the same game. Physical WhatsApp/iPhone recovery is still awaiting user retest.

## Learnings

A mobile-host flow must include foreground recovery because sharing an invitation commonly backgrounds the browser. Background lifecycle events are not equivalent to explicit Leave/Close. A live host phone still cannot guarantee background rendering or persistent network connections.

## Next

User should refresh to load the new version, load the game, share via WhatsApp and tap Resume game on return. If still frozen, capture whether the button appears, the message it shows, and whether the browser reloaded the tab; investigate physical iOS interruption versus context loss rather than assuming a desktop test proves recovery.
