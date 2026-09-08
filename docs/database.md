# Índice SQLite

Produção usa expo-sqlite. Testes usam SQLite real em memória via node:sqlite através
da mesma interface SqlDatabase. O banco é aberto como `seleva.db`, com WAL, foreign keys
e busy timeout. Não contém cópias dos arquivos da galeria.

Migration 1 cria photos, photo_analysis, photo_labels, photo_clusters,
photo_cluster_members, scan_jobs, cleanup_history, user_preferences e photo_ocr FTS5.
Migration 2 adiciona o hash de conteúdo usado para clusters de duplicatas exatas.
Versões usam PRAGMA user_version; cada atualização ocorre dentro de transação exclusiva.
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
