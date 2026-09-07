# ADR 005 — SQLite local

Aceito. expo-sqlite fornece o banco local e FTS5 com migrations transacionais.
PhotoRepository usa paginação por cursor e parâmetros SQL. Testes executam SQLite real,
sem mock de parser SQL. Writer nativo e path compartilhado serão definidos antes do scanner.
Não há Firebase, Supabase, Drizzle ou sincronização cloud nesta implementação.
