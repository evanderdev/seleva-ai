# Query engine

`SearchRequest` contém uma `SearchExpression` validada por Zod. Predicados de data, tipo,
favoritos, screenshots, qualidade, OCR, duplicatas e similaridade são resolvidos por
`SearchComposition` através do `CapabilityRegistry`.

`PhotoRepository` executa os providers SQL com candidate sets lazy, FTS5, cursores e clusters
calculados pelo worker nativo. Proteções não suportadas geram erro explícito; nunca são ignoradas.
`minSpaceToRecover` continua sendo uma meta futura do planner de limpeza, enquanto `maxResults`
limita o orçamento total paginado.

O Intent Engine interpreta a linguagem natural localmente e entrega um `SearchRequest` com AST.
Atalhos e parser constroem a mesma AST canônica diretamente; não existe um caminho estruturado
paralelo para adaptar planos antigos. A composition não conhece o parser, SQLite ou providers
nativos. Nenhum provider executa exclusão.
