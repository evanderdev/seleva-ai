# SelevaAI Engine Architecture

The engine has one search contract: `SearchRequest`, whose `expression` is a validated `SearchExpression` AST. A predicate names a stable capability ID, operator, and JSON value. Boolean nodes compose predicates with `and`, `or`, and `not`.

The Intent Engine only interprets user input. It normalizes language, resolves deterministic entities and dates, applies `SelectionContext` operations, and returns the AST. It does not open SQLite, inspect the gallery, or run an image model.

Analysis and search are separate compositions:

```text
Native gallery → AnalysisComposition → versioned local signals/indexes

User input → Intent Engine → SearchExpression → SearchComposition → Selection
```

`CapabilityRegistry` is the shared extension catalog. A plugin provides a manifest and only the roles it needs: `Analyzer`, `QueryProcessor`, `SearchEngine`, or `RankingEngine`. `CapabilityResolver` evaluates platform, OS, permissions, models, dependencies, and resources and returns `available`, `degraded`, or `unavailable`.

`SearchComposition` orders predicates by declared cost, propagates bounded candidate sets, and returns a report listing executed and unavailable predicates. It fails closed for incomplete `AND` expressions, so unsupported capabilities cannot silently widen a result. It never starts gallery-wide analysis during a query.

The catalog currently registers metadata, date, language, OCR, people, place, visual labels/background/semantic, duplicates, similarity, quality, screenshots, and documents. A manifest without a real provider is intentionally unavailable; it is not a production mock. The structured filter adapter exists only at the parser/UI and SQLite boundaries while existing explicit controls are migrated to native predicates.
