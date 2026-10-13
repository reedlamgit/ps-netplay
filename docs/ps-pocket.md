# PS Pocket two-player prototype

Website: https://ps-pocket.vercel.app
Signaling service: https://ps-netplay.onrender.com

## Play together

1. Host opens the website and selects their own CHD game and 512 KB PlayStation BIOS from Files.
2. Start the game, then select **Create room**.
3. Use **Share** (where supported) or copy the room link and send it to one friend.
4. Friend opens the link, selects **Join room**, and optionally **Enable sound**.
5. Host selects a two-player mode inside the game. Guest controls are routed to the emulator’s second controller port.

Start with both devices on the same Wi-Fi. Keep the host browser foregrounded, screen unlocked, and preferably in landscape. After switching apps, return and tap **Resume game** to wake the emulator and audio. Brief lifecycle events no longer explicitly destroy the room. Long backgrounding can still disconnect it; the page will ask you to create and share a new room if that happens. If iOS discards the tab or loses the graphics context, reload and select the files again. The emulator's controls handle P1; the custom controller handles P2.

## Architecture

- `web/`: static Vercel website, no ROMs or BIOS files.
- EmulatorJS stable CDN: PlayStation core runs only on the host.
- Existing Rust Socket.IO server: `open-room`, `join-room`, `users-updated`, and `webrtc-signal`. No backend changes were required for streaming.
- WebRTC: direct 640×480 canvas video, OpenAL-source audio, reliable data channel carrying held-button snapshots.
- Inputs are validated against joypad button IDs and apply only to player index 1. A one-second watchdog releases stale input.
- Room capacity is two. Random 96-bit invitation IDs and a per-room domain avoid listing these rooms under a shared public room directory. Invitation links should still be treated as private; this is not an authenticated service.
- BIOS files are packed locally into an uncompressed ZIP to preserve the filename required by the core. Files are not uploaded.

## Limits

- No TURN relay: cellular, symmetric NAT and restrictive networks may fail. No automatic ICE restart; terminal failure closes the room and users can reopen it.
- No P3/P4 or multitap.
- Host phone can overheat or stop streaming when backgrounded/locked.
- Physical iPhone hosting and sustained performance have not been verified.
- Game/BIOS licensing and compatibility remain the user's responsibility.
- EmulatorJS internal APIs (`simulateInput`, OpenAL graph, canvas viewport) depend on the loaded stable version.
- Guest gamepad support is not implemented; touch and keyboard are available.

## Verify and deploy

```bash
node --test tests/*.test.mjs
vercel --cwd web --scope afterschool1 --prod --yes
```

Desktop browser E2E used real local files, two tabs, the live Render server and the production Vercel website. Verified video frames, audio decoding, simultaneous touch presses/releases on P2, third-player rejection, and host-close cleanup. Phone-sized portrait and landscape checks found no horizontal overflow and controller targets at least 44 pixels high.

The automated headless browser's mDNS loopback failed even without the application. Granting microphone permission in the **test browser context only** made direct loopback work; no microphone capture or permission request was added to the website. Do not interpret these tests as proving connectivity on arbitrary phone networks.

## Source publishing

Keep Render's Rust service on branch `rust`. Frontend source can be published separately on branch `web` so frontend commits do not unnecessarily restart the Rust service. Do not commit `.vercel/`, `.local-test/`, local game files, or any credential file.
