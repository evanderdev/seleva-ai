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
- Retornos do módulo são unknown até validação Zod no adapter; ausência do módulo não pode aparentar sucesso.
- SQL usa parâmetros, páginas até 200 e cursores ligados à consulta. Proteções/rankings não implementados geram erro explícito.
- Não editar schema inicial depois que houver dados de produção: adicionar migration com nova versão.
- Não declarar build nativo ou performance validados com base em bundles/testes TypeScript.
- `queryAssets` filtra no PhotoKit/MediaStore antes de paginar; não filtrar apenas os 60 itens no JS. Cursores pertencem à categoria e ao período.
- Screenshots Android usam heurística de nome/pasta; iOS usa subtipo PhotoKit. Não tratar esses resultados como recomendação automática de exclusão.
- A navegação principal é um Stack: Home com prompt/sugestões, resultados em `/library` e Settings no único botão do cabeçalho. Não reintroduzir abas inferiores.
- O prompt usa somente regras locais neste incremento: screenshots/prints, vídeos, favoritos, fotos e termos de idade. A rota de resultados mantém filtros e permite voltar para refazer a consulta.
- Preferência `themeMode` (light/dark) é persistida junto ao idioma; o Home já aplica o fundo escuro e os próximos componentes devem consumir a mesma preferência.

## Estado Atual das Features

- [x] Etapas 1–4: workspace, Expo Router, UI foundation, tema, i18n e contratos de domínio.
- [x] Etapa 5: SQLite, migration inicial, FTS5, repositórios paginados e testes com SQLite real.
- [x] Persistência local da preferência de idioma.
- [x] Etapa 6, código/configuração: Expo Module, CNG, plugin e Development Build.
- [x] Etapa 6, validação: APK Android debug arm64 compilado; execução em dispositivo e iOS pendentes.
- [ ] Etapas 7–8: código nativo escrito; falta validação em dispositivo.
- [x] Código de leitura paginada e thumbnails PhotoKit/MediaStore; validação nativa pendente.
- [x] Prévia da galeria com FlatList e 60 assets transitórios por página; sem indexação JS.
- [x] Busca nativa por fotos, vídeos, screenshots, favoritos e itens anteriores a um ano; UI em en/pt-BR/es. Validação em dispositivo pendente.
- [x] Prévia ampliada com metadados e seleção transitória por página na aba Limpar; ainda sem ação de lixeira.
- [x] Fluxo de prompt para resultados: comandos locais simples escolhem categoria/idade e abrem a galeria; voltar permite refazer a consulta.
- [ ] Etapa 9: galeria real conectada ao índice.
- [ ] Etapa 10: scanner nativo, checkpoints, retomada e indexação incremental.
- [ ] Etapas 11–21: análise, OCR, busca, limpeza com revisão, regras de intenção e polish.

## Contratos e banco

`packages/core`: PhotoAsset, PhotoAnalysis, PhotoQuality, PhotoCluster, ScanJob,
ScanProgressEvent, QueryPlan/PhotoQueryPlan, PhotoQuery, CleanupCandidate, PhotoEngine e IntentProvider.
`packages/database`: schema version 1, foreign keys, WAL, migration transacional e FTS5
sincronizado por triggers. Consultas por data/tipo/tamanho/qualidade/screenshots/OCR/labels/clusters.
Índice ainda vazio: não existe worker que o alimente. `getSummary` não estima espaço recuperável.
`packages/photo-engine`: adapters de capacidades/permissões, leitura paginada e thumbnails.
O reader nativo alimenta apenas a prévia transitória; o índice ainda depende do scanner.
Native events do scanner estão declarados, sem emissões fictícias.

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

Última rodada: typecheck nos seis pacotes, lint e 26 testes passaram. Bundle Android dos
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
