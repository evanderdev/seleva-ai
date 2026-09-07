# Query engine

QueryPlan/PhotoQueryPlan são validados por Zod. Screenshots, duplicatas e similares têm filtros
distintos; banco consulta clusters quando existirem. Intervalos inválidos são rejeitados.
Favoritas são excluídas por padrão. minSpaceToRecover é uma meta futura do planner de limpeza,
não uma garantia da consulta; maxResults limita o conjunto total paginado.

PhotoRepository executa o subconjunto implementado com SQL parametrizado e FTS5.
Proteções não suportadas geram erro, nunca são ignoradas. IntentProvider só interpreta
planos; RuleIntentProvider e a conexão do campo Ask Seleva serão implementados nas etapas 18–19.
Nenhum provider executa exclusão.
