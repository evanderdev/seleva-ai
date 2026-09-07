# Índice SQLite

Produção usa expo-sqlite. Testes usam SQLite real em memória via node:sqlite através
da mesma interface SqlDatabase. O banco é aberto como `seleva.db`, com WAL, foreign keys
e busy timeout. Não contém cópias dos arquivos da galeria.

Migration 1 cria photos, photo_analysis, photo_labels, photo_clusters,
photo_cluster_members, scan_jobs, cleanup_history, user_preferences e photo_ocr FTS5.
Versões usam PRAGMA user_version; cada atualização ocorre dentro de transação exclusiva.
Banco de versão futura é rejeitado. Triggers mantêm OCR sincronizado em insert/update/delete,
inclusive deleção em cascata de assets.

PhotoRepository consulta páginas de no máximo 200 registros por keyset (ordem + ID).
Cursores são vinculados ao plano e respeitam maxResults acumulado. Filtros usam SQL parametrizado;
termos FTS são frases escapadas, não sintaxe livre. Ordenação usa data, tamanho ou qualidade.
Favoritas são protegidas por padrão; consumidores da galeria devem solicitar explicitamente sua inclusão.
Exclusões por álbuns/pessoas e rankings ainda indisponíveis falham explicitamente.

Preferências de idioma já são persistidas. O índice ainda não recebe fotos: seu writer será
um worker nativo em lotes na fase de scanner. Não usar repositório TS para varrer foto por foto.
Compartilhamento da conexão/path entre Expo SQLite e worker nativo exige uma decisão testada antes do scanner.

Os testes verificam migrations idempotentes/rollback, paginação com empates, FTS e cascatas,
proteção de favoritas, binding de entradas hostis, ordenação e persistência de preferências.
