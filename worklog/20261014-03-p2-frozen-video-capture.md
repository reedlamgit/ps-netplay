# P2 frozen video capture

## Summary

User reported P2 connected but frozen on one frame. Deployed a more robust capture/readback path and visible stream diagnostics at https://ps-pocket.vercel.app. Physical iPhone retest is still required.

## Problems

- Original RAF copy loop scheduled its successor after copying; a transient canvas error killed all subsequent frames. Reproduced with a failing regression test.
- Sustained browser testing exposed a separate concrete failure: P1's native game moved while copied preview remained black. WebGL context had preserveDrawingBuffer=false, letting the compositor discard pixels before asynchronous readback.
- Connection status incorrectly claimed live streaming without measuring video delivery.

## Solutions

- Scoped pre-start getContext wrapper forces preserveDrawingBuffer=true only for EmulatorJS game WebGL context; wrapper restored after startup/errors.
- Visible outgoing 640×480 preview; manual captureStream(0)/requestFrame per successful copy, automatic captureStream(30) fallback for missing requestFrame.
- Schedule next RAF before drawing; retry zero-sized source/resize errors, expose last error and copy counts, remove preview on stop.
- Every 1.5 seconds collect encoded/received/decoded RTC counters. Guest requestVideoFrameCallback counts display frames; host shares paused/capture/error state via data channel. Header now says controls ready, not a false live-video guarantee.
- P2 Resume video reattaches the existing stream and invokes play in a user gesture.

Changed: media/app/room modules, index/style, new readback and stream-stats modules, three regression test files, docs.

## Verification

- 25 Node unit tests pass; syntax checks pass.
- Readback-disabled baseline: native P1 game visible, outgoing preview black despite positive encode/decode FPS. Confirmed actual context attribute false.
- Readback-enabled test: actual preserveDrawingBuffer=true; nonblack streamed Konami/game frames visible and counters advance ~22 FPS.
- Injected draw exception: receiver frames advanced from 110 to 197 after error instead of stopping.
- Simulated pagehide/runtime/audio suspension plus host Resume game and guest Resume video recovered same emulator and sustained video.
- Production Vercel test: visible nonblack frames, total guest video frames 67 → 201 over six seconds, capture/receiving/decoding/display ~22 FPS.
- Scoped Luna 6 low review assessed the described approach, not full source, and found no definite approach-level issue; phone/browser-specific behavior still unverified.
- Local evidence screenshots under .playwright-cli/, not published with game/BIOS.

## Learnings

Do not count connected peers or even encoded/decoded frames as sufficient proof of useful video: a pipeline can encode continuous black or unchanged images. Verify native source, copied preview, visible receiver pixels and sustained frames. Browser feature availability is distinct from correct WebGL readback and physical iOS performance.

## Next

Refresh both physical phones and create a new room; P1 must reload so its WebGL context is recreated with preservation. If still frozen, collect P1 preview behavior and P2 receiving/decoding/display counters to isolate remaining iOS capture versus display failure.
