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

## Estado Atual das Features

- [x] Etapas 1–4: workspace, Expo Router, UI foundation, tema, i18n e contratos de domínio.
- [x] Etapa 5: SQLite, migration inicial, FTS5, repositórios paginados e testes com SQLite real.
- [x] Persistência local da preferência de idioma.
- [x] Etapa 6, código/configuração: Expo Module, CNG, plugin e Development Build.
- [ ] Etapa 6, validação: compilar e executar em Android e iOS.
- [ ] Etapas 7–8: permissões nativas escritas; faltam validação em dispositivo, enumeração, metadata e thumbnails.
- [ ] Etapa 9: galeria real conectada ao índice.
- [ ] Etapa 10: scanner nativo, checkpoints, retomada e indexação incremental.
- [ ] Etapas 11–21: análise, OCR, busca, limpeza com revisão, regras de intenção e polish.

## Contratos e banco

`packages/core`: PhotoAsset, PhotoAnalysis, PhotoQuality, PhotoCluster, ScanJob,
ScanProgressEvent, QueryPlan/PhotoQueryPlan, PhotoQuery, CleanupCandidate, PhotoEngine e IntentProvider.
`packages/database`: schema version 1, foreign keys, WAL, migration transacional e FTS5
sincronizado por triggers. Consultas por data/tipo/tamanho/qualidade/screenshots/OCR/labels/clusters.
Índice ainda vazio: não existe worker que o alimente. `getSummary` não estima espaço recuperável.
`packages/photo-engine`: adapter de capacidades/permissões; restante do PhotoEngine ainda não implementado.
Native events do scanner estão declarados, sem emissões fictícias.

## Ambiente

Node recomendado: 22.22.0; Node local 22.9.0 requer runtime temporário para comandos.
Nesta máquina não foram encontrados JDK/Android SDK nos locais convencionais.
iOS exige macOS/Xcode. Validação de compilação nativa e performance permanece pendente.
Os limites mínimos de SO seguem Expo/RN, não a disponibilidade de IA generativa.

Prebuild Android e autolinking reconheceram o módulo local. Gradle falhou antes de compilar:
JAVA_HOME não definido e java ausente do PATH. Prebuild iOS foi recusado pelo Expo no Windows.
Backup automático Android está desativado; exclusão de backup iOS do índice precisa ser
implementada e validada antes de persistir análises pessoais.

Última rodada: typecheck nos seis pacotes e 17 testes passaram; lint e Expo install --check
passaram. Autolinking Android/Apple identifica o módulo. Ver docs/verification.md.
