# SelevaAI — Contexto

## Arquitetura vigente

- Analysis Composition nativa (2026-09-10): o scanner Android resolve `content.screenshot`, `quality.visual`, `similarity.perceptual`, `duplicate.exact` e `text.ocr` por analyzers registrados antes de selecionar IDs pendentes. O adapter JS faz uma única seleção por lote e mantém o ACK somente depois do commit SQLite; thumbnails, OCR e hashes continuam no `PhotoScanRunner`/`PhotoAnalyzer` Kotlin. Fast/deep preservam cache e versões `android-fast-2`/`android-heuristic-2`.
- Fonte única de sinais (2026-09-10): a migration 7 remove `photo_analysis` e o FTS `photo_ocr` após materializar o schema final. O writer e os readers usam somente `photo_analysis_capabilities`, `photo_quality_signals`, `photo_content_signals`, `photo_hashes` e `photo_ocr_text`; `photo_ocr_index` é mantido por triggers do texto OCR. Não reintroduzir fallback agregado.

O prompt posterior em `docs/specification.md` substitui as escolhas RN CLI/TurboModule manual
do AGENTS.md original. Usar Expo SDK 57, React Native 0.86.3, React 19.2.3, Expo Router,
Development Builds, Expo Modules API e CNG. Workspace pnpm 9.15.0 com Turborepo.

## ⚠️ Regras Estritas

- Engine modular (2026-09-10): a busca usa `SearchRequest` com `SearchExpression` AST (predicados por `capabilityId` e composição AND/OR/NOT). `CapabilityRegistry` é único e compartilhado por `AnalysisComposition` e `SearchComposition`; `CapabilityResolver` retorna `available`, `degraded` ou `unavailable`. Analyzers, `QueryProcessor`, `SearchEngine` e `RankingEngine` são contratos independentes. A engine não acessa SQLite, ML Kit, Vision ou ONNX diretamente. O adapter `structuredPlanToExpression` existe somente na borda do parser/UI para converter filtros explícitos em predicados.
- Engine modular — validação (2026-09-10): catálogo inicial de 15 capabilities com manifests tipados foi registrado em `packages/core/src/capability-catalog.ts`; capabilities sem provider real permanecem indisponíveis, sem mocks. `SearchComposition` ordena predicados por custo, propaga candidate sets e retorna relatório explícito de degradação/indisponibilidade. `AnalysisComposition` processa batches versionáveis e isola falhas.
- Engine modular — primeira migração SQLite (2026-09-10): `PhotoRepository.query` agora executa `SearchComposition` com `SqlCandidateIndex` e plugins SQL para metadata/data, screenshots, qualidade, OCR, duplicatas e similaridade; cursores e orçamento total continuam persistidos no candidate set. O antigo `packages/database/src/query.ts` foi removido. O runtime atual do repositório é Android baseline; injeção de capacidades reais por plataforma ainda é necessária antes da paridade iOS.
- AST canônica (2026-09-10): parser, atalhos, seleções salvas e repositório constroem/consomem `SearchExpression` diretamente. Adapters `structuredPlanToExpression` e `expressionToStructuredPlan` foram removidos; novas features devem adicionar predicados e manifests, sem criar um formato paralelo.
- Feedback local (2026-09-10): `cleanup_feedback` registra recommendation/decision por asset para futuros sinais de ranking; não inclui prompt, OCR ou conteúdo visual.

- Foundation de domínio (2026-09-10): `packages/core` expõe contratos agnósticos de plataforma para `Person`, `Place`, `Label`, `OCRText`, `QualitySignal`, `Selection`, `SearchIntent` e `ActionIntent`, todos com schemas Zod. Esses contratos não implicam que os produtores Android/iOS ou a persistência de seleções já existam. O foco de implementação/validação é Android; iOS só começa após o MVP Android.
- MVP Fase 1 (2026-09-10): seleções nomeadas agora persistem em `saved_selections`/`saved_selection_members` (migration 3), com query opcional e reabertura no `LibraryScreen`; a mídia nunca é copiada. A seleção ainda é carregada como uma página limitada no UI. O scanner continua foreground e a validação do Development Build Android está bloqueada pelo toolchain NDK.
- Validação Android da Foundation (2026-09-10): `pnpm.cmd build:android:local` alcançou o projeto nativo, mas falhou em `onnxruntime-react-native:buildCMakeDebug[arm64-v8a]` porque o `clang++.exe` do NDK retornou `Permission denied`. Não declarar Development Build validado até corrigir a permissão/execução do toolchain Windows.

- Android (2026-09-09): hash visual usa aHash de thumbnail 8x8 cobrindo a imagem inteira. `android-fast-2`/`android-heuristic-2` substituem as versões Android v1 no nativo e no predicado de cache; iOS permanece v1. Grupos exact e visual são independentes, com hashes visuais separados por geração; SHA-256 não substitui associação visual. Contagens usam IDs distintos.
- Lixeira Android: somente `MediaStore.createTrashRequest(..., true)` e resultado do SO; nunca usar exclusão permanente como fallback. Android < 11 retorna indisponível. A revisão usa SafeAreaProvider/SafeAreaView dentro do Modal, conteúdo rolável e rodapé fixo. AppState não pode limpar a seleção enquanto a confirmação da lixeira está em andamento; cancelar preserva seleção e índice.

- Home: manter um único módulo “Fotos parecidas”, incluindo cópias exatas e semelhanças visuais. O filtro `similar` inclui clusters exact/visual/similar; `duplicate` permanece disponível para buscas específicas. Não reintroduzir dois cards sobrepostos.

- SQLite/FTS (2026-09-08): abrir `seleva.db` com `finalizeUnusedStatementsBeforeClosing: false`, opção herdada pelas transações exclusivas. A limpeza automática do Expo SQLite pode finalizar statements internos do FTS duas vezes ao fechar a conexão, causando corrupção de memória/SIGSEGV (Expo #38168). `runAsync`/`getAllAsync` já finalizam seus statements; uso futuro de `prepareAsync` exige `finally`. Preservar APIs assíncronas e ACK após commit. Ver `docs/database.md`.

- Pipeline progressivo (2026-09-08): metadata -> fast -> deep. `startFastScan` exige novo Development Build, sem fallback para OCR. Metadados persistidos liberam a Home; `analysisStage` distingue fast/deep.
- Cache: `android-fast-1`/`ios-fast-1` satisfazem somente fast. As versoes completas v1 satisfazem ambas as etapas. `fastPending` e `pending` contam pendentes rapidos e completos separadamente. Sem migration.
- Esta regra substitui a fila de analise serial descrita abaixo: fast usa ate 3 thumbnails simultaneos e deep usa 1; lotes de analise ate 20. OCR e SHA-256 ficam somente em deep. Pausa drena tarefas em andamento sem interromper ML Kit.
- Clusters globais: no maximo uma atualizacao a cada 5 segundos durante lotes, mais atualizacao terminal. ACK continua depois do commit SQLite. Thumbnail indisponivel nao deve marcar analise como concluida.

- Prioridade atual: Android; iOS fica para depois, conforme orientação do usuário.
- Android: `PhotoScanRunner` coordena lotes/ACKs, `PhotoAnalyzer` executa OCR/hashes/qualidade, `PhotoThumbnailStore` cuida das miniaturas e `PhotoLibraryService` do MediaStore. `PhotoWorker` mantém filas seriais separadas para scan (prioridade background), miniaturas e consultas. Analise limitada a 20 assets por lote, ate 3 bitmaps em fast, um bitmap/OCR em deep e um reconhecedor por lote deep. No teardown, suprimir eventos, liberar ACK e terminar o asset em andamento sem interromper ML Kit enquanto usa o bitmap.
- Insights durante scan são coalescidos e limitados a uma atualização por segundo após liberar resultados; transições finais sempre atualizam. SQLite mantém o fluxo assíncrono existente e ACK depois do commit.
- A galeria Android usa componentes memoizados (`Thumbnail` e `LibraryGridItem`), `renderItem` estável e `Set` memoizado para seleção. Itens da `FlatList` não devem receber callbacks ou objetos recriados a cada render; mudanças de seleção devem limitar o render às células afetadas.

- A abertura passa por `PreparationScreen` até existir metadata salva (ou biblioteca vazia concluída). `resultsAvailable` libera navegação independentemente da fase do scanner; lotes seguintes, pausa e falha não desmontam a galeria. Permissão revogada bloqueia novamente. Cache de análises também libera acesso ao reabrir.
- Android: scanner e thumbnails usam filas seriais próprias, fora da fila padrão Expo. Nunca bloquear a fila Expo esperando confirmação JS/SQLite de um lote. A galeria usa `removeClippedSubviews=false` e evita recorte arredondado no contêiner de cada miniatura, como mitigação do crash `libhwui/ClipStack::restore` observado no aparelho.

- Pré-análise preserva os lotes já confirmados no SQLite. Antes de analisar um lote nativo, consultar os IDs pendentes por `modified_at`, `analysis_version` e `model_version`; nunca reanalisar itens com cache válido só porque outro item está pendente.
- A conclusão da etapa de metadados fica em `user_preferences` (`library-metadata-v1`), com validade de seis horas e escopo de permissão. Atualização manual invalida essa conclusão, sem apagar análises. Acesso limitado exige reconciliação ao reabrir. Mudanças na galeria dentro desse intervalo exigem atualização manual; observadores incrementais persistentes continuam pendentes.
- `startIncrementalScan` e `selectScanAssets` exigem novo Development Build. Cada lote espera a seleção de pendentes e depois a confirmação de persistência; clusters são publicados por lote em transação SQL. Versões dos algoritmos nativos e do predicado de cache devem mudar juntas.

- Fotos, vídeos, OCR e metadata pessoais nunca saem do aparelho. Sem backend/IA paga/login no MVP.
- Processamento pesado será Swift/Kotlin em batches; nunca atravessar JS/nativo por foto para indexar.
- Nenhuma exclusão sem preview, seleção, confirmação explícita e API do SO; preferir lixeira.
- SQLite é source of truth; Zustand só guarda estado pequeno.
- Configuração nativa persistente fica em app.config.ts/plugins/Expo Modules; android/ios são gerados e ignorados no Git.
- Expo Go serve UI; produto completo requer Development Build. Nunca sacrificar recursos nativos pelo Expo Go.
- UI usa messages em en, pt-BR e es, com fallback inglês. Primitivas React Native substituem componentes DOM incompatíveis.
- OCR Android usa ML Kit bundled e OCR iOS usa Vision; ambos processam imagens localmente e persistem somente texto/metadata no SQLite.
- Retornos do módulo são unknown até validação Zod no adapter; ausência do módulo não pode aparentar sucesso.
- SQL usa parâmetros, páginas até 200 e cursores ligados à consulta. Proteções/rankings não implementados geram erro explícito.
- Não editar schema inicial depois que houver dados de produção: adicionar migration com nova versão.
- Não declarar build nativo ou performance validados com base em bundles/testes TypeScript.
- `queryAssets` filtra no PhotoKit/MediaStore antes de paginar; não filtrar apenas os 60 itens no JS. Cursores pertencem à categoria e ao período.
- Screenshots Android usam heurística de nome/pasta; iOS usa subtipo PhotoKit. Não tratar esses resultados como recomendação automática de exclusão.
- A navegação principal é um Stack: Home com prompt/sugestões, resultados em `/library` e Settings no único botão do cabeçalho. Não reintroduzir abas inferiores.
- O Development Build usa `expo-splash-screen` com plugin no `app.config.ts`; ao adicionar módulos Expo nativos, executar prebuild antes do Gradle.
- Intent Engine (2026-09-09): o prompt usa contrato assíncrono `SelevaIntent` validado por Zod, aliases determinísticos, datas naturais encapsuladas por `chrono-node` e fallback semântico local lazy com MiniLM multilíngue quantizado/ONNX Runtime. Texto original vai ao embedding; identifiers internos ficam em inglês. Pesos/tokenizer são fixados por revisão/checksum e preparados por `pnpm intent:model`; protótipos são pré-calculados. Nenhum prompt, embedding ou imagem sai do aparelho. O planner só entrega `QueryPlan` suportado; categoria/ação/ranking ainda indisponível retorna estado explícito. Linguagem destrutiva nunca chama a lixeira e preserva revisão/confirmações existentes.
- Preferência `themeMode` (light/dark) é persistida junto ao idioma; o Home já aplica o fundo escuro e os próximos componentes devem consumir a mesma preferência.

- Tema de referência centralizado em `packages/ui`: `ThemeProvider`/`useTheme`, paletas claras/escuras, botões e ícones nativos. Novos componentes devem consumir esses tokens, sem cores de texto fixas do tema claro.
- Home e painel de edição dos resultados compartilham `features/search/prompt.ts`, validado com Zod. Atalhos usam filtros explícitos; palavras de comando não viram termos OCR.
- Resultados mostram contagem e seleção da página (até 60 itens), sem apresentar essa contagem como total global. Prévia e confirmação do SO continuam obrigatórias para lixeira.

## Estado Atual das Features

- [x] Etapa inicial da migração da busca (2026-09-10): o caminho SQLite real usa registry, resolver, composition e candidate sets SQL para as capabilities implementadas; lint, typecheck e 92 testes passaram. Ranking de tamanho/qualidade possui provider SQL.
- [x] Primeira migração da Analysis Composition (2026-09-10): o scanner Android registra adapters nativos para os estágios fast/deep, resolve pendências por cache e despacha uma seleção única por lote antes do ACK. A execução de pixels permanece nativa; persistência, versões e retomada continuam no protocolo existente. As migrations 5 e 6 gravam estado/erro por capability e sinais específicos de qualidade, conteúdo, hashes e OCR; o cache reabre capabilities falhas para retry. Typecheck, lint e 94 testes passaram; compilação Kotlin do módulo nativo passou.

- [x] Refatoração da engine modular (2026-09-10): `SearchExpression`, `SearchRequest`, `CapabilityRegistry`, `CapabilityResolver`, Analysis/Search Composition, analyzers/query processors/search engines/rankers e catálogo inicial de capabilities implementados. Parser, SelectionContext, SQLite e seleções salvas usam a AST; 92 testes, lint e typecheck passam. Providers reais de semantic visual, pessoas e labels continuam planejados e são reportados como indisponíveis.

- [x] Fase 1, seleções salvas (2026-09-10): persistência SQLite, reabertura e UI multilíngue implementadas; 81 testes passaram. Incremental em background, similaridade aproximada e validação Android em aparelho continuam pendentes.

- [x] Foundation de domínio completada (2026-09-10): contratos e validações Zod para seleção, busca e ações adicionados em `packages/core`, com teste de fronteira. Sem migration ou dependência nova. Android permanece a plataforma prioritária; validação nativa e comportamento do MVP ainda pendentes.

- [x] Correções Android de hash visual completo e preservação de clusters após deep; revisão com área segura e ação principal única de lixeira, confirmação nativa e mensagens en/pt-BR/es. Sem dependência nova ou migration. Testes SQLite de regressão e testes JVM do hash adicionados.

- [x] Progresso dedicado em `/progress` (2026-09-09), aberto pelo status “Processando fotos e vídeos…” na Home: etapa atual, contagem e percentual por etapa, estados de pausa/erro/conclusão e retomada. Consome LibraryProvider sem iniciar outro scan; traduções en/pt-BR/es. Fotos parecidas mostra COUNT(DISTINCT photo id) de clusters exact/visual/similar com mais de um membro, somente fotos, incluindo favoritas como a galeria. Sem migration. Typecheck, lint e 73 testes passaram; validação visual no aparelho pendente.

- [x] Home simplificada (2026-09-08): pergunta e prompt no topo, módulos de Fotos e Vídeos separados abaixo e status discreto, substituindo o resumo técnico antes do prompt. Entrada suave e resposta ao toque com Animated nativo, respeitando movimento reduzido; mantém tokens claros/escuros e messages en/pt-BR/es. Sem dependências novas. Validação visual e fluidez em aparelho pendentes.

- [x] Pipeline fast/deep, cache por etapa, resultados de metadata progressivos e labels en/pt-BR/es. Instrumentacao agregada Android/JS, sem dados pessoais. Ver docs/scan-pipeline.md para validacao e limites.

- [x] Modularização Android e isolamento das filas nativas; liberação de bitmaps em falhas OCR e proteção quando a imagem redimensionada é a própria origem. Lint, typecheck, 66 testes Jest, 2 testes JVM e APK arm64 passaram. APK instalado e app aberto no aparelho; estabilidade prolongada/30k+ assets ainda pendente.
- [x] Primeira extração da UI da galeria: thumbnail e célula virtualizada isolados em componentes memoizados, com callbacks estáveis e seleção em `Set`. Typecheck, lint e 66 testes passaram.

- [x] Loading inicial dedicado com leitura/categorização e progresso; Home posterior com resumo antes do prompt e dos filtros. Traduções en/pt-BR/es, typecheck, lint e 63 testes. Validação visual em aparelho pendente.

- [x] Home sem miniaturas de galeria, com resumo de metadados, análises concluídas e pendentes; resultados salvos ficam disponíveis durante os lotes seguintes.
- [x] Cache persistente da preparação, reutilização de análises por asset e retomada dos pendentes após reabrir. Validação: lint, typecheck, 61 testes e build Android arm64; dispositivo/iOS ainda pendentes.

- [x] Abertura solicita permissão automaticamente, indexa metadados e analisa pendentes; Home liberada por resultados persistidos, mantendo o scan em foreground.
- [x] Estimativa de economia por cópias exatas excedentes, preservando favoritas e uma cópia por hash; tamanhos desconhecidos não geram bytes estimados.
- [x] Removidos FoundationScreen, cards antigos de gestão e rotas /search e /clean. Permanecem Home, Library e Settings no design system novo.

### Regras da preparação automática

- `LibraryProvider` coordena apenas um scan e pede pausa ao sair do foreground. `startMetadataScan` e `acknowledgeScanBatch` exigem novo Development Build.
- O scanner aguarda commit SQLite antes de enviar outro lote. Clusters são reconstruídos em SQL, sem carregar todas as análises no JavaScript.
- Após interrupção, a enumeração nativa reinicia com segurança; análises válidas são reutilizadas por asset, e a etapa de metadados concluída é restaurada do cache. Cursor nativo persistente entre processos ainda não é suportado.
- PhotoKit ainda não fornece tamanhos de originais nessa leitura; a UI informa quando a estimativa é parcial. Vídeos grandes representam espaço para revisão, não economia garantida.
- Validação deste incremento: typecheck, lint, 50 testes e APK Android compilado. Swift e performance em biblioteca grande ainda exigem validação nos dispositivos.

- [x] Etapas 1–4: workspace, Expo Router, UI foundation, tema, i18n e contratos de domínio.
- [x] Etapa 5: SQLite, migration inicial, FTS5, repositórios paginados e testes com SQLite real.
- [x] Persistência local da preferência de idioma.
- [x] Etapa 6, código/configuração: Expo Module, CNG, plugin e Development Build.
- [x] Etapa 6, validação: APK Android debug arm64 compilado; execução em dispositivo e iOS pendentes.
- [ ] Etapas 7–8: código nativo escrito; falta validação em dispositivo.
- [x] Código de leitura paginada e thumbnails PhotoKit/MediaStore; validação nativa pendente.
- [x] Prévia da galeria com FlatList e 60 assets transitórios por página; sem indexação JS.
- [x] Busca nativa por fotos, vídeos, screenshots, favoritos e itens anteriores a um ano; UI em en/pt-BR/es. Validação em dispositivo pendente.
- [x] Prévia ampliada com metadados, seleção transitória por página e confirmação para mover itens à lixeira.
- [x] Fluxo de prompt para resultados: comandos locais simples escolhem categoria/idade e abrem a galeria; voltar permite refazer a consulta.
- [x] Etapa 9: galeria e dashboard consultam o índice SQLite quando há dados indexados; a leitura nativa permanece fallback para índice vazio e filtros ainda não analisados.
- [x] Etapa 10, base: scanner nativo em lotes, progresso, cursor persistido e retomada; pausa/cancelamento precisam de validação no dispositivo.
- [ ] Etapa 10, completa: reconciliação de removidos ao fim de scans completos e análise incremental por modificação/versão implementadas; enumeração incremental e WorkManager/background execution ainda pendentes.
- [x] Etapas 11–14, base local: blur/brilho, pHash, hash de conteúdo, OCR nativo e clusters são persistidos em lotes; validação iOS ainda pendente.
- [ ] Etapas 15–21: ranking de candidatos, melhor foto, background completo, regras avançadas de intenção e polish.
- [x] Seleva Intent Engine: entrada livre en/pt/es, canonical intent, aliases, tamanhos, datas naturais, fallback semântico ONNX multilíngue, lifecycle lazy, validação Zod, planner para `QueryPlan`, integração Home/edição e degradação explícita. Ranking de cleanup, categorias sem labels e best-shot continuam dependentes das etapas futuras.
- [x] Validação Android do Intent Engine: prebuild CNG e APK arm64 passaram com ONNX Runtime 1.24.3; patch pnpm remove dependências de teste/ramo RN <0.71 incompatíveis com Gradle 9 e fixa o AAR Android em 1.24.3. Metro/Hermes empacotou o modelo quantizado e tokenizer. Benchmark local de quatro frases inéditas passou; primeira inferência ~652 ms no desktop, seguintes 9–11 ms. Medição em aparelho continua pendente.

- [x] Tema das referências aplicado à Home, resultados, painel inferior de busca e configurações; preferências claras/escuras em todas essas telas, traduções en/pt-BR/es e funcionalidades locais conectadas.
- [ ] Comparação visual final do tema no aparelho desbloqueado e no iOS.

## Contratos e banco

`packages/core`: PhotoAsset, PhotoAnalysis, PhotoQuality, PhotoCluster, ScanJob,
ScanProgressEvent, QueryPlan/PhotoQueryPlan, PhotoQuery, CleanupCandidate, PhotoEngine e IntentProvider.
`packages/database`: schema version 8, foreign keys, WAL, migration transacional e FTS5
sincronizado por triggers. Consultas por data/tipo/tamanho/qualidade/screenshots/OCR/labels/clusters.
O writer recebe lotes nativos e mantém `scan_jobs`; `getSummary` informa contagens e bytes conhecidos.
`packages/photo-engine`: adapters de capacidades/permissões, leitura paginada, thumbnails, scanner e lixeira.
O reader nativo continua como fallback para páginas sem índice ou filtros que ainda dependem de análise nativa.

## Ambiente

Node recomendado: 22.22.0 ou compatível; nesta sessão o Node local é 24.20.0.
JDK Temurin 17 e Android SDK 36 agora estão instalados localmente em `.tools`, ignorado pelo Git e Metro.
Inclui build-tools 36, platform-tools, NDK 27 e CMake. Sem alterar JAVA_HOME/PATH permanentemente.
`pnpm build:android:local` configura o ambiente filho. Ver docs/android-local.md.
iOS exige macOS/Xcode. Validação de compilação nativa e performance permanece pendente.
Os limites mínimos de SO seguem Expo/RN, não a disponibilidade de IA generativa.

Prebuild Android e autolinking reconheceram o módulo local. A falta inicial de Java/SDK foi resolvida;
APK Android debug arm64 compilado com sucesso via unidade virtual temporária S:. Prebuild iOS foi recusado pelo Expo no Windows.
Backup automático Android está desativado; exclusão de backup iOS do índice precisa ser
implementada e validada antes de persistir análises pessoais.

Última rodada: typecheck nos seis pacotes, lint e 33 testes passaram. Bundle Android dos
filtros compilado pelo Metro. APK debug Android atualizado compilado com sucesso e instalado
no aparelho conectado via adb; execução funcional da galeria ainda precisa ser observada no aparelho.
Bundles Android/iOS e APK da prévia anterior constam em docs/verification.md.

O APK anterior falhava antes do JavaScript porque `expo.modules.ExpoModulesPackageList` não estava gerada. O `expo prebuild` regenerou o autolinking e o build direto no caminho original corrigiu isso. `tooling/android-build.ts` agora mantém projeto e dependências na mesma raiz para evitar conflito no codegen.

## Leitura da biblioteca

- API aceita até 200 registros; UI mantém apenas 60 por página, com grid virtualizado.
- Cursores iOS pertencem a snapshot lazy PHFetchResult e expiram quando a biblioteca muda.
- Android pagina por ID decrescente; criação usa datetaken, com fallback date_added.
- `queryAssets` requer novo Development Build. Adapter recusa módulo antigo sem ignorar filtros. Favoritos Android exigem API 30+.
- Buscar e Limpar reutilizam a galeria paginada; seleção reinicia ao trocar página/filtro ou sair da tela. Ainda não existe plano de limpeza, ranking ou estimativa de espaço recuperável.
- Thumbnails ficam em cache nativo de até 200 arquivos/~24 MB; iOS não baixa conteúdo do iCloud.
- Não usar esta API em loop para implementar scanner JS; indexação deve permanecer nativa.

## Validacao Android da Fase 1 (10/09/2026)

- APK debug compilado e instalado no Samsung SM-S918B conectado via adb; a Home carregou dados indexados de screenshots, fotos parecidas e fotos borradas.
- O fluxo de selecoes salvas usa SQLite migration 3 (`saved_selections` e `saved_selection_members`) e permite salvar/reabrir a selecao atual.
- Nao houve crash fatal na observacao do aparelho. O Android exibiu alerta de alinhamento ELF para paginas de 16 KB em bibliotecas nativas; validar dependencias antes do release.
- Incremental/background automatico, similaridade aproximada e validacao completa do trash no hardware continuam pendentes da Fase 1.

## Execucao dos gaps da Fase 1 (10/09/2026)

- Ao retomar o app do background, `LibraryBootstrap` força uma reconciliação de metadata; análises permanecem incrementais pelo cache de asset/versão. WorkManager nativo completo continua fora do caminho JS atual, pois a persistência e o protocolo de ACK dependem da sessão React ativa.
- `PhotoRepository.rebuildClusters` agora cria grupos `similar` para hashes Android dentro de distância de Hamming <= 8 em buckets de quatro nibbles, sem carregar a biblioteca inteira no JavaScript. O teste SQLite cobre o agrupamento aproximado.
- O plugin `withAndroid16kPackaging` configura `expo.useLegacyPackaging=true` durante o prebuild para empacotar bibliotecas nativas de forma compatível. APK recompilado, instalado e iniciado no Samsung SM-S918B sem alerta 16 KB nesta rodada.
- Typecheck, lint e 83 testes passaram. Ação de trash foi mantida exclusivamente reversível via confirmação do sistema; não foi automatizada para evitar alterar fotos reais durante a validação.

## Verificacao dos refinamentos do Notion (10/09/2026)

- O contrato de SelectionOperation foi alinhado ao refinamento: o nome canônico de ampliar contexto é `broaden` (não `expand`), com teste de aceitação e rejeição do alias antigo.
- O restante do documento está factual: Selection Context cumulativo, pessoas/lugares/objetos, favoritar e compartilhar seguem pendentes; OCR, lixeira, seleções salvas e similaridade Android permanecem nos níveis parciais/implementados descritos.

## Correção do erro Android no Intent Engine (10/09/2026)

- O Development Build no SM-S918B não expõe `NativeModules.Onnxruntime`; o import lazy de `onnxruntime-react-native` tentava executar `Module.install()` com módulo nulo e mostrava `Cannot read property 'install' of null`.
- `apps/mobile/src/features/search/intent-engine/mobile.ts` agora verifica a capability nativa antes do import do ONNX. Quando ausente, o engine semântico falha de forma controlada e o planner determinístico permanece disponível.
- Typecheck, lint e 83 testes passaram. Após recarregar no aparelho, a Home e o comando `clean screenshots` abriram Resultados sem tela vermelha ou erro fatal no logcat. ONNX semântico continua opcional neste build.

## Seleções salvas na Home (10/09/2026)

- Seleções salvas agora aparecem na Home, no mesmo grid das categorias, com nome e quantidade de itens.
- A navegação envia somente o `selectionId`; a página de resultados recupera a seleção pelo SQLite e pagina seus membros em blocos de 60.
- A seleção salva continua podendo ser revisada e explicitamente enviada à lixeira. Ao editar ou limpar o filtro, o fluxo volta para uma consulta normal.

## Implementação do refinamento do engine (2026-09-10)

- SelectionContext agora possui reducer puro com operações `new`, `add`, `restrict`, `exclude`, `remove`, `replace` e `broaden`; o contexto pequeno pode ser persistido junto a seleções salvas (migration 4).
- A pipeline mantém texto original, normalização NFKC, identificação/tradução ML Kit Android opcionais e fallback multilíngue determinístico. Language ID/Translate são expostos pelo Expo Module sem tornar a busca dependente de modelo ou rede.
- Matchers determinísticos são registráveis e retornam evidências; o planner expõe métricas agregadas (`language_id_ms`, `translation_ms`, `deterministic_ms`, `semantic_ms`, `context_reduce_ms`, `planner_ms`) sem registrar prompts ou dados pessoais.
- QueryPlan ganhou entidades preparadas (`people`, `places`, `sceneLabels`, `source`) e exclusões de screenshots/labels. Filtros ainda não indexados retornam `filterUnavailable` explicitamente.
- Ações destrutivas agora produzem `ActionIntent` de `trash` com revisão obrigatória; a UI continua responsável pela prévia, confirmação e API de lixeira do sistema.
- Typecheck, lint e 91 testes passaram. APK Android arm64 foi compilado com ML Kit Language ID/Translate; instalação no aparelho conectado ficou pendente porque o `adb install` não respondeu.
