# Índice SQLite

## Fechamento de conexões com FTS

Abrir `seleva.db` com `finalizeUnusedStatementsBeforeClosing: false`.
As conexões criadas por `withExclusiveTransactionAsync` herdam essa opção.
Na versão instalada do Expo SQLite, a finalização automática percorre também
statements internos do FTS; o fechamento pode liberá-los novamente e corromper
memória nativa. Ver [Expo #38168](https://github.com/expo/expo/issues/38168).
`runAsync` e `getAllAsync` já finalizam seus statements em `finally`. Se adicionarmos
uso direto de `prepareAsync`, finalizar explicitamente em `try/finally`.
Preservar transações assíncronas, FTS e ACK somente após commit.

Regressão observada no Android em 2026-09-08: após um lote de análises, falha em
`NativeDatabase.closeAsync` com referência a statement finalizado, espera de ACK
até timeout e SIGSEGV. Também houve crashes em outros componentes nativos.
Jest com `node:sqlite` não exercita esse fechamento do Expo; validar no Development
Build com gravação de análises/FTS, fechamento das transações e reabertura do app.

Validação da correção: lint, typecheck dos seis pacotes e 72 testes Jest passaram.
No Android conectado, a etapa rápida concluiu a enumeração dos 4.324 assets e
avançou para OCR/hash, com múltiplos lotes completos sem novo SIGSEGV observado.
O processo foi reiniciado para conferir reaproveitamento do cache. Essa execução
não valida iOS nem estabilidade prolongada em bibliotecas de 30k+ assets.

Produção usa expo-sqlite. Testes usam SQLite real em memória via node:sqlite através
da mesma interface SqlDatabase. O banco é aberto como `seleva.db`, com WAL, foreign keys
e busy timeout. Não contém cópias dos arquivos da galeria.

Migration 1 cria photos, os índices iniciais, photo_labels, photo_clusters,
photo_cluster_members, scan_jobs, cleanup_history e user_preferences.
Migration 2 adiciona o hash de conteúdo usado para clusters de duplicatas exatas.
Migration 5 registra o estado e o erro de cada capability por asset. Migration 6 materializa
os sinais de qualidade, conteúdo, hashes e OCR em tabelas próprias. Migration 7 remove as
tabelas agregadas e instala `photo_ocr_index`, alimentado exclusivamente por `photo_ocr_text`.
As tabelas específicas são a única fonte de leitura e escrita; todos os writes acontecem na
mesma transação do lote.
Migration 8 registra feedback local da decisão do usuário (`cleanup_feedback`) para aprendizado
de ranking sem conteúdo visual. Versão atual: 8. Versões usam PRAGMA user_version; cada atualização
ocorre dentro de transação exclusiva.
Banco de versão futura é rejeitado. Triggers mantêm OCR sincronizado em insert/update/delete,
inclusive deleção em cascata de assets.

PhotoRepository consulta páginas de no máximo 200 registros por keyset (ordem + ID).
Cursores são vinculados ao plano e respeitam maxResults acumulado. Filtros usam SQL parametrizado;
termos FTS são frases escapadas, não sintaxe livre. Ordenação usa data, tamanho ou qualidade.
Favoritas são protegidas por padrão; consumidores da galeria devem solicitar explicitamente sua inclusão.
Exclusões por álbuns/pessoas e rankings ainda indisponíveis falham explicitamente.

Preferências de idioma já são persistidas. O scanner grava lotes de metadados no índice e a UI
consulta esses dados quando disponíveis; o writer também remove assets que desapareceram após
uma varredura completa. Não usar repositório TS para varrer foto por foto.

Os testes verificam migrations idempotentes/rollback, paginação com empates, FTS e cascatas,
proteção de favoritas, binding de entradas hostis, ordenação e persistência de preferências.
# Database

## Migrations

The schema is version 6. Migration 3 adds `saved_selections` and
`saved_selection_members`, which persist named selections without copying
media. Members reference the native asset identifiers already stored in
`photos`; deleting an asset cascades to saved selections. The selection query
is stored as JSON so it can be reopened with the same filters, while the
SQLite index remains derived from the native gallery.
