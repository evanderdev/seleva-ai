# Plano de ação — refatoração da engine

Este plano parte do commit `3d51cc8`. A prioridade é retirar responsabilidades da arquitetura antiga e conectar o que já existe à nova composition. Capabilities novas só entram depois que o caminho de busca e análise estiver usando os contratos novos de ponta a ponta.

Cada etapa deve terminar com código compilável, testes atualizados e um checkpoint revisável. Nenhuma etapa deve criar um segundo caminho permanente ou uma flag para escolher entre engines.

## Ordem geral

```text
Refatorar contratos e boundaries
        ↓
Migrar execução existente
        ↓
Conectar Analysis/Search Composition ao app
        ↓
Remover adapters e caminhos antigos
        ↓
Adicionar capabilities novas
        ↓
Validar nativo, performance e produto
```

## Etapa 0 — congelar o baseline

Objetivo: tornar o estado atual mensurável antes de mover mais código.

- Registrar o inventário de entradas da busca, consultas SQLite, scanner, providers nativos e persistência.
- Definir fixtures sintéticas para metadata, screenshots, OCR, blur, duplicatas, similaridade, favoritos e vídeos.
- Executar `pnpm lint`, `pnpm typecheck` e `pnpm test` e guardar os resultados no checkpoint.
- Definir métricas internas sem prompts ou conteúdo de fotos: tempo de parsing, planejamento, consulta, ranking, assets processados e falhas por capability.

Saída: baseline reproduzível e lista de consumidores de cada módulo antigo.

## Etapa 1 — consolidar os contratos do domínio

Objetivo: deixar `SearchExpression` e `SearchRequest` como os únicos contratos de busca em produção.

- Validar AST com limites de profundidade, quantidade de nós, operadores e valores.
- Separar tipos de domínio, runtime, disponibilidade, resultados e erros.
- Definir o contrato final de `CandidateSet`, cursor e paginação sem transportar listas grandes pelo JS.
- Remover nomes e tipos antigos do código de produção, inclusive adapters que só existem para preservar o formato anterior.
- Garantir que `SelectionContext` opere sobre AST para `new`, `add`, `restrict`, `exclude`, `remove`, `replace` e `broaden`.

Saída: core sem `QueryPlan`, com testes de fronteira e testes de composição booleana.

## Etapa 2 — completar Registry e Resolver

Objetivo: fazer o runtime resolver capabilities, e não a Composition Engine conhecer implementações.

- Validar manifests no registro: ID único, versão, funções, plataforma, custo, persistência, dependências e fallback.
- Resolver dependências, ciclos, permissões, APIs nativas, modelos, arquitetura, versão do sistema e recursos do aparelho.
- Definir seleção de provider por prioridade e disponibilidade.
- Registrar métricas de resolução e o motivo de cada degradação.
- Criar testes para provider primário, múltiplos providers, fallback e capability ausente.

Saída: registry único usado tanto por análise quanto por busca.

## Etapa 3 — migrar a busca estruturada existente

Objetivo: retirar a execução de busca de `PhotoRepository` e transformá-la em plugins.

Ordem de migração:

1. `metadata.core` e `query.date`;
2. `content.screenshot`;
3. `quality.visual`;
4. `duplicate.exact`;
5. `similarity.perceptual`;
6. `text.ocr`;
7. favoritos, tamanho, tipo e origem.

Para cada capability:

- criar o manifest final;
- extrair a query SQL existente para um `SearchEngine`;
- manter parâmetros SQL e cursores por consulta;
- devolver `CandidateSet` e razões estruturadas;
- adicionar testes unitários e integração SQLite;
- conectar ao registry;
- remover o branch correspondente do query builder antigo.

Saída: `SearchComposition` executa consultas reais usando engines registradas.

## Etapa 4 — implementar o índice de candidatos

Objetivo: substituir conjuntos abstratos por uma implementação eficiente sobre SQLite.

- Criar um índice que represente conjuntos por consulta/materialização local, sem carregar a galeria inteira no JS.
- Implementar `universe`, `intersect`, `union`, `subtract` e paginação com cursor.
- Garantir que AND execute filtros baratos e seletivos antes dos caros.
- Garantir que OR e NOT preservem semântica booleana real.
- Associar fingerprint do cursor à expressão completa, versão dos índices e ranking.
- Medir memória, número de queries e tempo por etapa.

Saída: composition com candidate-set propagation real e sem filtragem limitada à página visível.

## Etapa 5 — conectar o Intent Engine

Objetivo: fazer toda entrada do usuário terminar em `SearchExpression` e `ActionIntent`.

- Separar definitivamente normalização, identificação de idioma, tradução, matchers, datas, entidades, fallback semântico e planner.
- Fazer matchers retornarem predicados e evidências, não campos crescentes em um objeto central.
- Fazer o planner validar capabilities necessárias contra o resolver.
- Preservar texto original apenas na interpretação; não persistir prompts crus nem enviar dados pessoais.
- Remover `structuredPlanToExpression` depois que todos os atalhos e o parser estiverem nativos em AST.
- Testar sequências cumulativas: pessoa → lugar → data → exclusão de screenshots → remoção de filtro.

Saída: Intent Engine sem conhecimento de SQLite, galeria ou providers.

## Etapa 6 — migrar a Analysis Composition

Objetivo: conectar os analyzers ao scanner nativo e eliminar análise implícita durante consultas.

- Transformar metadata, screenshot, qualidade, hash exato, hash perceptual e OCR em analyzers registrados.
- Reaproveitar `PhotoScanRunner`, filas Android, ACK após commit e cache por asset/versão.
- Fazer a composition ordenar tier 0, tier 1, tier 2 e tier 3 conforme custo e disponibilidade.
- Persistir `analysisVersion`, `modelVersion`, estado pendente e falha por capability.
- Preservar batches, pausa, cancelamento, retomada, limite de memória e liberação de thumbnails.
- O scanner deve publicar somente sinais persistidos; a UI não deve receber datasets grandes.

Saída: análise incremental usa a mesma registry e não duplica lógica entre scanner e capabilities.

### Incremento executado em 2026-09-10

- `CapabilityRegistry` agora aceita providers de plataforma anexados a manifests já registrados.
- O adapter Android registra analyzers para os estágios fast/deep e usa `AnalysisComposition` para cache, disponibilidade e lotes de até 20 assets.
- A seleção nativa é despachada uma vez por lote; o `PhotoScanRunner` continua responsável por thumbnails, OCR, hashes, pausa, retomada e ACK após o commit SQLite.
- A persistência ainda recebe o payload completo produzido pelo nativo. A extração de sinais por capability e o estado individual de falha permanecem como próximo incremento desta etapa.

## Etapa 7 — remover a arquitetura antiga

Objetivo: deixar apenas um caminho de execução.

- Remover query builder legado, tipos auxiliares e branches de fallback que duplicam engines migradas.
- Remover imports mortos, testes da arquitetura anterior e comentários de migração temporária.
- Confirmar por busca que não existem `QueryPlan`, `oldSearch`, `legacyEngine` ou chamadas diretas de provider a partir da composition.
- Atualizar documentação e ADRs para refletir somente o estado final.

Saída: qualquer capability nova entra por manifest + provider + registro, sem alterar composition.

## Etapa 8 — adicionar capabilities novas

Somente depois das etapas 1–7:

- `people.face`: detecção, clusters, resolução de nomes e filtro de presença;
- `place.geo`: coordenadas, place IDs e busca geográfica;
- `visual.labels`: labels versionadas e confidence;
- `visual.background`: segmentação e fallback por bordas/histograma;
- `content.document`: classificação explicável combinando OCR e sinais visuais;
- `semantic.visual`: embedding de imagem, processador de texto, índice vetorial e ranking semântico.

Cada capability deve ter provider real, disponibilidade explícita, persistência versionada, fallback documentado e testes de boundary. Não registrar mocks como suporte.

## Etapa 9 — ranking, ações e seleção

- Separar filtro de ranking para qualidade, recência, redundância, importância e best shot.
- Criar `RankingEngine` com explicações e confidence.
- Manter ações destrutivas como `ActionIntent` revisável.
- Garantir fluxo preview → seleção → confirmação explícita → API de lixeira do SO.
- Registrar aprendizado local das decisões sem conteúdo visual ou prompts crus.

## Etapa 10 — validação final

- Testes de registry, resolver, analysis composition, search composition, AND/OR/NOT, candidate sets, planner e SelectionContext.
- Integração SQLite com FTS, paginação, cursores, migrations e resultados indisponíveis.
- Testes Android JVM e Development Build; observar permissões, trash, OCR, scanner, retomada e ausência de crash.
- Validar iOS após o caminho Android estar estável.
- Exercitar 30k+ assets com métricas de RAM, bateria, temperatura, tempo de indexação e retomada.
- Atualizar `MEMORY.md` somente com fatos verificados.

## Critérios para considerar a refatoração encerrada

- A UI chama uma única Search Composition.
- O scanner chama uma única Analysis Composition.
- Ambas usam o mesmo Capability Registry.
- Nenhuma composition conhece SQLite, ML Kit, Vision, ONNX ou classes nativas concretas.
- Todas as capabilities implementadas têm provider real e manifest válido.
- Predicados indisponíveis aparecem no resultado; nunca são descartados silenciosamente.
- Não existe caminho paralelo legado em produção.
- A busca não dispara análise massiva.
- O fluxo de lixeira continua revisável e reversível quando o SO permitir.
- Lint, typecheck, testes, integração SQLite e validação nativa passam nos ambientes suportados.
