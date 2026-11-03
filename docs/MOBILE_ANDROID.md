# Private Android touch build

This adaptation runs the original RA2 executable inside the project's v86 runtime, in an offline Android WebView. It does not boot Windows, stream a PC, or port the original engine to ARM. The application ID is `local.ra2.mobile.full`; the APK version is `0.8.9` (17), with Android 10 as the minimum OS.

## Resources and build

Use a privately owned original installation. `game.exe`, the native `Ra2.exe` launcher and `Ra2.lcf`, `ra2.mix`, `language.mix`, and both campaign map archives are required. Never put these assets in source control. This user's installation has five-byte placeholders for `movies01.mix`, `movies02.mix`, and `Theme.mix`; this build cannot supply their missing campaign movies or music. It includes original RA2, not Yuri's Revenge.

The Android project stages `dist` and bundles `.private-apk/installation`. The latter contains original files plus a JSON manifest of `{name,size}` entries. The file provider loads immutable files lazily; IndexedDB saves override bundled assets. All original-resource extensions must remain uncompressed in the APK because range reads use `AssetFileDescriptor`. Staging appends `.bin` to gzip source archives so Android does not silently decompress and rename them; the offline HTTP host maps their original URLs to those exact preserved bytes.

Install the package manager version from `package.json`, Android SDK 36, JDK 17 and Gradle 9.5.0. The upstream CPU build requires its documented Rust/LLVM toolchain. On a host with a verified CPU cache, run:

```powershell
./scripts/mobile/packageAndroid.ps1 -GameDirectory $GameDir -AndroidSdk $SdkDir -JavaHome $JdkDir -Gradle $GradleExe
```

The script preserves a prior private installation under a unique backup name, installs with the frozen lockfile, builds and verifies the production distribution, then produces `android/app/build/outputs/apk/debug/app-debug.apk`. Use the same signing key for future upgrades to preserve app data. This private test package uses the local Android debug signing key. Original game files and signing keys must not be published.

## Touch behavior

The mobile main and single-player menus use a full-viewport illustrated background with independently sized touch targets. Their buttons query current visible native control geometry and forward clicks to the original menus; campaign, skirmish setup, and save dialogs retain the native workflow. Returning to the native main menu restores the mobile presentation. A native-interface fallback is available in the footer. The overlay disappears before gameplay; it does not change battle rendering, coordinates, or aspect ratio. Artwork provenance and the generation prompt are in `MOBILE_MENU_ART.txt`.

- Tap native buttons, units, destinations, and enemies. Drag one finger to select a rectangle. Drag two fingers to pan in the direct-manipulation direction (the map follows the fingers); pinch to zoom. The Pan button also enables one-finger panning while taps still issue orders. Two-finger taps cancel.
- Build with the original right sidebar. Tap a completed building, then tap valid ground; dragging previews its footprint and releasing places it. Original legality checks remain authoritative. Placement hides selection actions.
- Native group slots 1–5: tap Save Group then a slot to assign the current selection; ordinary slot taps select and center. Slots show native membership counts and remain stored after construction and native save/load. The group popup appears only on request and closes after saving, recalling, explicitly closing, or starting a map gesture. The persistent strip contains Pan, Groups and Actions; deployment, stop, same-type selection and zoom buttons live in the dismissible Actions popup. The right sidebar remains unobstructed.
- Additional orders, repair (K), sell (L), force attack, attack move and additive selection are in the collapsible menu. Modifier modes release after one map gesture, cancellation or loss of focus.
- Original Escape menus handle campaign/skirmish save and load. A completed save is flushed to IndexedDB. Backup/restore uses the project's save-transfer format; Android exports into Downloads/RA2Mobile. Uninstalling clears internal saves.

## Single-player trainer

Memory policies live in `src/games/ra2/mobileControl.ts`, behind original executable signatures. Campaign session mode 0 and skirmish mode 5 are allowed; other modes reject mutation. Local ownership is checked before editing objects or factories.

Money changes the local house's funds. Normal, accelerated and instant production, cross-faction technology and automatic elite are provided by the signature-checked native hooks documented below. Buildings have no native star rank; the selected-building durability tool changes current health to three times original full health. Healing restores original health, including removing a durability boost.

## Acceptance and limits

`tests/real-game/browser/mobileAcceptance.mts` uses actual Chromium touch input against a local server serving the bundled installation and development modules. `MOBILE_SCENARIO` selects `allied`, `soviet`, or `skirmish`. Native UI layout and observations are read-only diagnostics; ordinary game actions and cheats go through touch controls. The test saves through native menus, destroys the page/VM, and loads the persisted save in a fresh VM.

Passing first-mission smoke tests are not certification of all campaign missions, cutscenes, lengthy battles, Android device performance, or PC-save interchange. Record exact current results in delivery notes. Keep pre-existing Windows/CI unit-test failures separate from verified mobile regressions. The original cutscene smoke remains a failure with this installation's missing movie assets.

## Fullscreen loading and native dialogs

The initial HTML placeholder and React loading cover use `MOBILE_LOADING_ART.txt` and its local asset. They cover runtime boot and transitions into battle; status text is explicit and the animation is indeterminate, with no invented percentage. Errors retain the existing error UI. Native centered menus are expanded from their 800px template across the viewport. The same canvas CSS rectangle maps touch coordinates. Geometry is checked against native controls before cropping: battle options and save/load screens that anchor controls outside the centered template retain the complete widescreen surface, so their buttons stay reachable.

The command panel sits on the left, reserves the right sidebar, and has no blocking backdrop. A pointer-down on the native canvas closes it without consuming the event, so one tap can both dismiss the panel and start production. The command panel has four tabs (orders, campaign guide, trainer, settings), a scrollable content region and a fixed bottom Return Game button. Less common commands and selected-object tools are collapsed.

## Native trainer implementation

`src/games/ra2/mobileTrainer.ts` installs signature-checked trampolines before guest execution and changes only data flags at runtime. This avoids replacing instructions already translated by v86. Each native hook checks single-player Session mode (campaign 0 or skirmish 5) and the current local House. Multiplayer and other players retain native behavior.

Address research used the RA2 1.006 project `lyfhc0305/ra2-trainer`, particularly `trainer/production.py`, `trainer/build_unlock.py`, `trainer/techno_ai.py`, and `trainer/addresses.py`. Relevant instructions were independently disassembled in the supplied executable. No third-party trainer executable is bundled and its Python implementation is not redistributed. Yuri's Revenge trainers use different addresses and are not compatible.

- Production: Factory timer continuation at 0x4b9342. Normal, 10x and instant modes preserve native payment and placement; paused production is not resumed. Instant mode sets progress to the last native increment and lets the original completion path run. It is not free production.
- Cross-faction technology: House CanBuild tech-level at 0x4e372a and prerequisites at 0x4e38fc, plus factory owner at 0x5d6078. Changes trigger House.RecheckTechTree. Actual category factories, airfield capacity, building placement rules, disabled TechLevel -1/255 types and native quantity limits remain. This opens both factions' eligible tech without fabricating sidebar entries.
- Automatic elite: Techno AI at 0x6c74c0 updates owned, living Infantry/Unit/Aircraft objects every native tick. RA2 veterancy is a DOUBLE at +0x118, set to 2.0; +0x11c is its high DWORD, not a separate float. Existing and subsequently produced units are covered. Disabling stops future promotion but does not demote existing units.
- Settings last for the running VM, including native save/load in that VM. A cold app restart defaults the switches off; saved unit ranks and buildings remain native save data. Building durability is current health, not a new building rank or permanent rules modification.

Asset-free hook tests execute real x86 using boot.bin/v86 and check ownership, paused/off/network paths and all three unit classes. Private browser tests check production, placement, new units and saved-game behavior against original resources. Packaging verification compares every bundled resource and production web asset by SHA-256. Device performance still requires testing on the user's actual phone.

The Android launcher label is 红色警戒2. Its generated military-star icon has legacy and adaptive launcher resources; artwork provenance is in `MOBILE_ICON_ART.txt`.

## Native groups, camera and map zoom

`mobileInput.ts` validates the original RA2 1.006 team-create (0x6f5d90), team-select (0x6f5f00), team-center (0x6f60d0), camera-clamp (0x6a8c80) and camera-apply (0x6a9170) signatures. Its pre-execution trampoline chains the existing control tick at 0x5406ac. Host requests change mailbox data only. Native team IDs are stored at Techno +0x1ac; membership is observed from living owned objects, not a local UI array. Camera navigation updates projected pixel centers through native clamp/redraw, without a right-button gesture that would clear unit selection. Native unit orders keep running while the camera moves.

Mobile rendering uses an 800-pixel-high native battlefield, capped at 1920 pixels wide. The generic GPU `regionPresentation` pass crops/scales the map at 75–200% while retaining the sidebar/footer regions. `mobileViewport` supplies game-specific rectangles; input uses their inverse mapping. Zooming out exposes more of the native world surface. Rendering and input both disable region mapping on Canvas 2D fallback. Native menu geometry is presented independently from battle zoom. This adds native render work and a GPU color copy; Android performance is not established by desktop browser results.

`mobileInteractionAcceptance.mts` exercises original-resource skirmishes with real browser touch events: two independent native groups, movement orders, map direction, pinch and one-finger pan without deselection, zoomed hit testing, native sidebar production/placement and cold save/load restoring both groups. `MOBILE_FACTION=soviet` also requires the chosen country to create a Soviet MCV and tanks. Resource-free tests cover inverse region mapping and signature rejection. Acceptance artifacts record failed attempts separately from the final reruns.

## Mobile country selection

The country fields and bottom country buttons open a large React choice grid. `ui.select` validates the visible ComboBox and requested index, then queues CB_SETCURSEL to its actual guest WndProc before CBN_SELCHANGE to its native parent. RA2's owner-drawn control stores selection outside the shim fallback map, so editing only that map changes diagnostics but not the country. Menu tests must assert the resulting original MCV/tank faction, not just text or selection readback. No new country types or rules are injected.

## Offline campaign guide

The Guide tab presents 24 original RA2 missions from `games/ra2/campaignGuide.ts`. Concise original tactical suggestions accompany fact-checked mission order and objectives; they are not a full playthrough certification. References: Steven W. Carter, Campaign Walkthroughs v1.0 (2000), and The Gamers’ Temple Allied Mission Walkthrough. The last chapter is saved locally, independently of game saves. Reading does not switch missions or automatically pause; an explicit action opens the original pause menu. The original single React tree and fixed Return Game footer remain in use.

## Mobile presentation and audio recovery

Loading destinations retain separate local artwork for startup, campaign, skirmish and save restore. Native menu notifications also update the destination, including navigation through the original menus. Single-player selection uses a distinct naval background.

The optional expanded construction sidebar supports 100–200% scaling with a viewport-width cap, preserves pixel proportions, and scrolls the entire native sidebar. Swipe inside it to scroll, pinch to scale independently of the battlefield, or use minus/percentage/plus controls; Radar returns to the top. Native clicks still control production. Entering building placement collapses the expanded sidebar. Map rendering and input share the same inverse region transform. The compact sidebar remains available.

Mobile sessions opt into dynamic-stream underrun concealment: after the longer of 750 ms or two buffer durations without writes, stale PCM becomes silent while the playback cursor keeps advancing. Newly written ranges resume; old ranges stay silent. Static looping sources retain native behavior. The ScriptProcessor fallback applies the same policy. Host background/foreground notifications suspend/resume the audio context, with touch unlock retained for browser autoplay restrictions. This is a bounded stale-buffer mitigation, not proof that every repeated guest-issued voice command is fixed.

Default mobile drags select a rectangle without a mode button. Before committing the native left-button drag, allow a 280 ms window from first contact for a second finger to upgrade to map navigation. Quick single-finger releases commit the rectangle immediately; cancellation clears the timer without issuing an order. Once the rectangle is committed, it stays a selection gesture until release. The optional Pan toggle retains one-finger navigation. Saving a group now requires tapping Save Group followed by its number. Ordinary group taps recall and center the group. Text selection and touch callouts are disabled on the game controls. Country pickers open on touch-down using local labels; native selection remains disabled until its original combo is ready. Native layout refresh runs once per second while the menu is visible.

Panning first moves the visible crop within the original rendered battlefield, then forwards overflow to the original camera. This makes cropped areas reachable when a small campaign map clamps the native camera. Rendering and input use the same clamped crop offset. Native group recall recenters the crop on the selected units, including when native bounds prevent centering the underlying camera. View offsets reset with the VM and the zoom-reset action. Bottom controls account for visual-viewport occlusion as well as safe-area insets.

`mobileCampaignTouchAcceptance.mts` covers the original Allied opening mission, waits for its scripted hero spawn, checks group collapse/recall, one/two-finger panning of the displayed crop, preserved selection and control bounds at three landscape sizes. This does not replace Android hardware testing or verification of all missions.
