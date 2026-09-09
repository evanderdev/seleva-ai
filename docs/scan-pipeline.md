# Progressive scan refactor - 2026-09-08

## Android correction - 2026-09-09

Android now computes a 64-bit average hash from all pixels of an 8x8 thumbnail.
The previous implementation sampled only the first 64 pixels of a 32x32 image.
`android-fast-2` and `android-heuristic-2` invalidate Android v1 cache entries;
iOS versions are unchanged. A first run with this build recalculates Android analyses.
Exact and visual SQL groups are built independently, so completing SHA-256 does
not remove visual matches. Visual groups separate algorithm generations; overlapping
groups still count each photo once. Approximate Hamming grouping remains future work.

Android trash now opens `MediaStore.createTrashRequest(..., true)` and waits for
the system result before updating SQLite. Cancellation preserves selection/index;
Android versions without system trash return unsupported without a delete fallback.
The review modal owns its safe area and keeps the trash footer outside scroll content.

## Repository audit and previous flow

`LibraryProvider` owns one foreground coordinator. Opening requests permission,
loads the six-hour metadata cache and starts native enumeration when needed.
`runLibraryScan` subscribes to native events. Native sends a metadata page; JS
writes it transactionally, selects pending IDs from SQLite, then tells native
which assets need analysis. Android limited analysis pages to 20; iOS used 100.

For each selected asset, the old analyzer synchronously requested a 224 px OS
thumbnail, calculated blur/brightness/visual hash, awaited OCR and streamed the
original into SHA-256. Only after the whole batch did JS persist analyses,
rebuild all clusters and ACK the batch. Home required at least one saved analysis.

| Problem                          | Location                                                | Cost and impact                                                     | Change                                                 |
| -------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| Serial OCR blocks cheap scores   | Android PhotoAnalyzer.kt; iOS PhotoLibraryService.swift | Native ML inference and thumbnail I/O delay every batch             | Explicit fast pass without recognizer; deep pass later |
| Original read for every photo    | Same analyzers, contentHash                             | Full-file disk I/O even though no full-resolution bitmap is decoded | SHA-256 exclusively in deep                            |
| Global cluster rebuild per batch | apps/mobile/src/services/scanner.ts                     | Repeated SQL scans/grouping grow with index size                    | At most every 5 seconds, plus terminal flush           |
| Home waits for analysis          | features/library/bootstrap.ts                           | Metadata-only results cannot unlock navigation                      | Saved metadata unlocks navigation                      |
| One image task at a time         | Native analyzers                                        | No overlap of bounded thumbnail requests                            | Three fast workers, one deep worker                    |

There is no image base64 transport, image manipulation dependency, AsyncStorage
photo index, unlimited image Promise.all, HEIC-to-JPEG conversion for analysis,
or per-photo JS analysis loop. iOS base64 encodes identifiers only. PhotoKit
requests disallow network access. Android API 29+ uses loadThumbnail; its older
fallback uses OS MINI_KIND thumbnails. UI thumbnails have a separate native queue
and file cache. React holds bounded pages; SQLite stores the index. Writes already
use transactions per batch, not per asset. State updates already use batch events
and coalesced, one-second insight refreshes. No new dependency/module is required.

## Implemented flow

```text
Permission + persisted cache
  -> metadata pages -> SQLite commit -> Home and metadata filters available
  -> fast pending-ID selection
  -> bounded native thumbnail workers (3)
  -> blur + brightness + visual hash + screenshot heuristic
  -> batch commit -> progressive counts/clusters -> ACK
  -> deep pending-ID selection (after the fast pass completes)
  -> native OCR + original SHA-256 (1 worker)
  -> batch commit + OCR FTS + exact clusters -> ACK
```

Queues are separate passes with strict fast-before-deep priority, sharing the
existing scan coordinator. No simultaneous competing deep pass is launched.
Both native implementations cap analysis batches at 20. Android tuning is in
`ScanTuning`; iOS tuning is centralized in PhotoLibraryService. There is at most
one bounded window of tasks in flight; completed buffers are released before the
next window. Backgrounding requests pause, prevents new image work and drains
in-flight tasks. Restart re-enumerates and skips valid saved work. No media is deleted.

The adapter requires `startFastScan` and refuses older binaries instead of falling
back to OCR. This requires rebuilding the existing Expo Development Build. Expo Go
cannot run this existing custom module. No eject, new native dependency or CNG
configuration change is needed; existing generated projects can rebuild directly.

Model versions encode stage completion without a schema migration:
`android-fast-1` / `ios-fast-1` satisfy fast only; existing full v1 versions satisfy
both. Modification time and analysis version still invalidate stale work.
`fastPending` counts unfinished quick analysis; `pending` counts unfinished full
analysis. UI distinguishes stages and partial counts in en, pt-BR and es.
Missing thumbnails remain pending. Failed iOS resource reads no longer publish a
hash of partial/empty content. Individual Android image errors do not abort a batch;
permission failures propagate after active tasks finish.

## Measurement and verification

No device timing baseline was captured before this refactor; the bottleneck claims
above describe synchronous dependencies observed in source, not measured percentages.
Do not infer a 1-3 second latency or 30k-asset memory guarantee from compilation.

Development-only Android `SelevaScan` logs aggregate discovery, metadata paging,
thumbnail acquisition, blur, brightness, visual hash, OCR, SHA-256, asset times,
photos/videos, cached/stopped items, failures and unavailable thumbnails.
Durations across parallel workers are summed and may exceed wall time.
JS `[SelevaAI Scan]` reports stage wall time, database persistence, duplicate
grouping, processed/total assets and written analyses. No IDs, OCR, file names,
locations or image pixels are logged. Native detailed timing is Android-only;
shared JS stage/persistence timings also cover iOS.

Validation includes real SQLite tests for fast/deep reuse and modification
invalidation, bootstrap ordering/unblocking, old-binary refusal, and existing
commit-before-ACK tests. Lint, typecheck and all 70 Jest tests passed. Android
arm64 debug compilation passed for the final native changes. Swift compilation requires macOS/Xcode.

For device comparison, use identical synthetic galleries and permission scope on
the baseline and refactored builds; compare cold and warm cache runs separately.
Record time to first visible committed result, stage durations, p95 frame times,
peak native memory, pause/resume and one corrupted/local-unavailable asset. Repeat
with 5k and 30k assets and low-memory devices before tuning concurrency.

## Remaining work and future optimizations

- OCR still examines all pending photos during deep analysis to preserve arbitrary
  text search. A candidate classifier is not introduced without coverage evidence.
- Deep analysis recalculates the small thumbnail metrics before replacing the
  complete row. This preserves existing full-analysis semantics, with some repeated work.
- Enumeration is still repeated across passes. Metadata discovery completes before
  visual analysis begins, although committed metadata already unlocks the app.
- Clusters still use global SQL grouping by equal compact hashes. No all-pairs
  comparison exists; approximate Hamming-distance grouping is not implemented.
  The existing visual hash/quality heuristics need accuracy calibration; they must
  never be treated as deletion confidence or a best-shot decision.
- Global grouping and insight aggregate queries may still dominate very large
  indexes. Incremental cluster maintenance is a future optimization after profiling.
- Background execution, automatic library-change reconciliation and runtime
  thermal/memory-aware concurrency remain future work. Foreground lifecycle pause
  and the existing six-hour cache/manual refresh behavior remain in place.
- Per-category completion beyond fast/full counts, detailed iOS profiling and
  PhotoKit preheating need device validation. iCloud-only resources remain local-only;
  incomplete deep content availability may require manual refresh/retry.
- No classifier, embeddings, receipt/meme detector, face-aware ranking, new ML model
  or automatic cleanup was introduced.
