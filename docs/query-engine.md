# Query engine

QueryPlan/PhotoQueryPlan são validados por Zod. Screenshots, duplicatas e similares têm filtros
distintos; banco consulta clusters quando existirem. Intervalos inválidos são rejeitados.
Favoritas são excluídas por padrão. minSpaceToRecover é uma meta futura do planner de limpeza,
não uma garantia da consulta; maxResults limita o conjunto total paginado.

PhotoRepository executa o subconjunto implementado com SQL parametrizado, FTS5 e clusters de
hashes calculados pelo worker nativo.
Proteções não suportadas geram erro, nunca são ignoradas. O campo Ask Seleva usa o Seleva Intent
Engine assíncrono: regras de alta confiança, datas naturais e fallback semântico multilíngue local
geram um `SelevaIntent` validado e, quando suportado, o `QueryPlan` existente. Intenções reconhecidas
que ainda não possuem API de galeria retornam um estado explícito. Nenhum provider executa exclusão.
Ver `docs/intent-engine.md`.
