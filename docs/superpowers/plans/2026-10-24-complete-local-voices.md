# Complete local character voices implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; review the final change once.

**Goal:** Complete all 132 existing story character lines locally using the selected role voices, keeping the 56 teammate recordings unchanged.

**Architecture:** Enumerate engine-compatible line IDs from story scenes. Generate only missing lines with a single loaded local Qwen Base model and cached voice-clone prompts. Atomically publish each valid MP3 into the existing fixed bank. Resume safely using script and reference hashes. Update preview coverage and verify all story branches, package and local playback.

**Tech Stack:** Node.js, Python 3.12, Qwen3-TTS 0.6B Base, CUDA, soundfile MP3.

**Spec:** User approval of He caring-v4 plus request to complete all voices locally.

## Global constraints
- Local files only, no push, upload or deployment.
- Preserve original 56 MP3s byte-for-byte and use He caring-v4, Stone adolescent reference.
- Do not change story text or supply narration/player voice.
- A successful generated file does not certify subjective acting quality; distinguish user-approved voice from generated takes.
- Support interruption/resume without replacing unrelated work.

## Review focus
- Choice and after IDs match engine; no duplicate IDs or unknown speaker.
- Player placeholders stay aligned between subtitles and audio.
- Corrupt, silent or clipped audio cannot be marked complete.
- Stale reference/text cannot be mistaken for a completed take.
- Default story playback and replay work with all four roles and mute/stop.

## Tasks
- [x] Inventory coverage and pin expected 132 lines plus original bank hashes.
- [x] Add regression tests for enumeration, protection and complete fixed-bank coverage (initially fail).
- [x] Implement resumable local generation with one loaded model; generate 76 missing lines and checkpoint each result.
- [x] Update preview to show all four roles and generated vs teammate recording provenance.
- [x] Run voice, engine, AI and story checks; static package and local HTTP/audio/branch checks.
- [x] Review final diff, preserve audit/backup, report exact coverage and subjective listening limitation.

## Ledger
- Original counts: Li 54, Stone 0/29, He 0/47, old He 2. Total 56/132.
- Ruling: keep current checkout because all accepted local voice work is uncommitted here; backup touched files instead of isolating away required assets.
- Ruling: generated takes need objective file checks and user listening; keep provenance explicit.

- Inventory correction: 56 + 76 = 132; 83 synthesis jobs include 7 extra address takes.
- Enumeration/protection test passed; address routing test failed on old default selection then passed after fixedLine variant selection. Full asset coverage test currently correctly fails 56 != 132 until integration.

- Added spoken-fallback voice regression: RED on fixed mode, GREEN with dynamic role speech. Engine, AI and story checks all pass while batch renders.

- Final: 132/132 lines, 139 unique MP3 files, 83 generated files, 475.32 default speech seconds. All decoded, durations checked, original56 hashes unchanged. Batch resume skipped83/83; subsequent prepare reported0 jobs.
- Reviewer found and corrected inaccurate fallback footer and incomplete reference identity validation. CLI black-box tests cover reference file/text/seed/bytes, script and output changes; all pass.
- Real four-role test exposed the older-person free-dialogue validator restriction. Added RED->GREEN API test; old He now allowed only mode free and given late-life context, beat/ask remain blocked. All four actual chat responses and Qwen WAV replies saved to output/local-role-dialogue.
- npm test, npm run test:ai, npm run check, npm run test:voice and local static packaging passed. Browser verified Stone/He fixed playback, stop/replay and He47-row filter; screenshot saved to output/本地配音-全部角色完成.png.
- No push/upload/publication. No remaining implementation task; subjective acting/pronunciation review of every take is not claimed.
