# Seleva Intent Engine

The search prompt is interpreted locally through a validated, asynchronous boundary. Natural
language ends at `SelevaIntent`; consumers receive an existing `QueryPlan` and never call gallery
or trash APIs from the interpreter.

## Pipeline

1. Normalize Unicode and whitespace while preserving the original multilingual text.
2. Extract high-confidence actions, canonical aliases, explicit sizes, OCR terms and natural dates.
3. When deterministic confidence is low, lazy-load a pinned quantized multilingual MiniLM ONNX
   model and compare the original text with precomputed concept vectors.
4. Merge only schema-valid semantic suggestions. Semantic output cannot create a destructive
   action.
5. Validate `SelevaIntent` and adapt supported fields to the existing `QueryPlan`.

Unsupported categories and operations return `unsupported`. Broad cleanup/free-space requests
without an executable filter return `clarification`. The UI explains these states instead of
silently running a different query. Delete-like language produces candidates only; the existing
preview, selection, app confirmation and OS trash confirmation remain mandatory.

## Model lifecycle and privacy

The ONNX session loads only for low-confidence input, is reused across prompts, serializes
inference and can be disposed. Prototype embeddings are generated at build time. Prompts,
embeddings and debug details are not persisted or logged. CPU is the configured execution provider.

Run `pnpm intent:model` before a Development Build. Run `pnpm intent:benchmark` for held-out
multilingual phrases. Debug timing is opt-in through `createIntentEngine({ debug: true })`.

Current planner limitations follow the existing gallery APIs: semantic document/tracking/OTP
categories, cleanup-probability ranking, best-shot selection and guaranteed free-space targets are
recognized but are not executed yet.
