# SelevaAI — Contexto

## Arquitetura vigente

O prompt posterior em `docs/specification.md` substitui as escolhas RN CLI/TurboModule manual
do AGENTS.md original. Usar Expo SDK 57, React Native 0.86.3, React 19.2.3, Expo Router,
Development Builds, Expo Modules API e CNG. Workspace pnpm 9.15.0 com Turborepo.

## ⚠️ Regras Estritas

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
- O prompt usa somente regras locais neste incremento: screenshots/prints, vídeos, favoritos, fotos e termos de idade. A rota de resultados mantém filtros e permite voltar para refazer a consulta.
- Preferência `themeMode` (light/dark) é persistida junto ao idioma; o Home já aplica o fundo escuro e os próximos componentes devem consumir a mesma preferência.

- Tema de referência centralizado em `packages/ui`: `ThemeProvider`/`useTheme`, paletas claras/escuras, botões e ícones nativos. Novos componentes devem consumir esses tokens, sem cores de texto fixas do tema claro.
- Home e painel de edição dos resultados compartilham `features/search/prompt.ts`, validado com Zod. Atalhos usam filtros explícitos; palavras de comando não viram termos OCR.
- Resultados mostram contagem e seleção da página (até 60 itens), sem apresentar essa contagem como total global. Prévia e confirmação do SO continuam obrigatórias para lixeira.

## Estado Atual das Features

- [x] Abertura solicita permissão automaticamente e inicia pré-indexação nativa de metadados, seguida de análise dos itens pendentes, com progresso e insights na Home.
- [x] Estimativa de economia por cópias exatas excedentes, preservando favoritas e uma cópia por hash; tamanhos desconhecidos não geram bytes estimados.
- [x] Removidos FoundationScreen, cards antigos de gestão e rotas /search e /clean. Permanecem Home, Library e Settings no design system novo.

### Regras da preparação automática

- `LibraryProvider` coordena apenas um scan e pede pausa ao sair do foreground. `startMetadataScan` e `acknowledgeScanBatch` exigem novo Development Build.
- O scanner aguarda commit SQLite antes de enviar outro lote. Clusters são reconstruídos em SQL, sem carregar todas as análises no JavaScript.
- Após interrupção, a enumeração reinicia com segurança; retomada eficiente e análise incremental por asset continuam pendentes.
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
- [ ] Etapa 10, completa: reconciliação de assets removidos foi adicionada ao fim de scans completos; ainda falta indexação incremental por data de modificação e WorkManager/background execution.
- [x] Etapas 11–14, base local: blur/brilho, pHash, hash de conteúdo, OCR nativo e clusters são persistidos em lotes; validação iOS ainda pendente.
- [ ] Etapas 15–21: ranking de candidatos, melhor foto, background completo, regras avançadas de intenção e polish.

- [x] Tema das referências aplicado à Home, resultados, painel inferior de busca e configurações; preferências claras/escuras em todas essas telas, traduções en/pt-BR/es e funcionalidades locais conectadas.
- [ ] Comparação visual final do tema no aparelho desbloqueado e no iOS.

## Contratos e banco

`packages/core`: PhotoAsset, PhotoAnalysis, PhotoQuality, PhotoCluster, ScanJob,
ScanProgressEvent, QueryPlan/PhotoQueryPlan, PhotoQuery, CleanupCandidate, PhotoEngine e IntentProvider.
`packages/database`: schema version 2, foreign keys, WAL, migration transacional e FTS5
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
