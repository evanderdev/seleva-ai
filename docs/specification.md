Você é o engenheiro principal responsável por **implementar do zero o SelevaAI**.

Não quero apenas arquitetura, pseudocódigo ou exemplos.

Quero que você:

* crie o projeto;
* configure o monorepo;
* implemente o aplicativo;
* escreva os módulos nativos;
* execute os comandos;
* rode lint/typecheck/tests;
* corrija erros;
* mantenha o projeto executável;
* avance progressivamente até um MVP funcional em iOS e Android.

---

# Produto

Nome:

**SelevaAI**

Tagline:

**Find. Select. Keep.**

SelevaAI é um aplicativo mobile global para iOS e Android que funciona como um **assistente inteligente e privado da biblioteca de fotos do usuário**.

O objetivo não é ser apenas um "photo cleaner".

O produto deve permitir:

* encontrar fotos;
* selecionar conteúdo relevante;
* identificar conteúdo descartável;
* localizar duplicadas;
* encontrar fotos semelhantes;
* detectar screenshots;
* detectar fotos ruins;
* encontrar vídeos grandes;
* pesquisar texto dentro das imagens;
* organizar a biblioteca;
* liberar armazenamento;
* futuramente selecionar as melhores fotos;
* futuramente interpretar comandos complexos em linguagem natural.

Exemplos:

```text
Free up 10 GB.

Find old screenshots.

Show blurry photos.

Find photos from work.

Find old receipts.

Keep the best photos from this trip.

Clean my gallery conservatively.
```

A filosofia principal é:

# Find. Select. Keep.

---

# Princípios fundamentais

O produto deve ser:

```text
Local-first
Privacy-first
Offline-first
Native where performance matters
Shared where product logic matters
Compatible with older devices
No paid AI dependency
```

A principal promessa de privacidade é:

# Your photos never leave your phone.

Fotos e vídeos do usuário não devem ser enviados para nossos servidores.

---

# Arquitetura escolhida

Utilize:

```text
Expo
React Native
TypeScript
Expo Development Builds
Expo Prebuild / Continuous Native Generation
Expo Modules API
Expo Router
Hermes

Swift
Kotlin

pnpm
Turborepo

SQLite
Zustand
i18n
Jest
```

---

# Importante sobre Expo

Expo será utilizado como framework principal do aplicativo.

Porém:

## Expo Go NÃO será o ambiente principal do produto.

Expo Go poderá ser utilizado somente enquanto funcionalidades forem compatíveis com ele, principalmente:

* UI;
* layouts;
* componentes;
* navegação;
* Zustand;
* i18n;
* lógica TypeScript;
* protótipos.

Assim que uma funcionalidade depender de código nativo customizado, utilizar:

# Expo Development Build

O projeto deve estar preparado desde o início para Development Builds.

---

# Fluxo esperado

Durante desenvolvimento inicial:

```text
Expo Go
   ↓
UI / navigation / prototyping
```

Quando os módulos nativos começarem:

```text
Expo Development Build
        ↓
Expo Modules
        ↓
Swift / Kotlin
```

Não tente comprometer a arquitetura para continuar compatível com Expo Go.

Se uma funcionalidade importante precisar de native code:

**implemente corretamente usando Expo Modules.**

---

# Expo Go não é requisito arquitetural

NUNCA evite:

* PhotoKit;
* Vision;
* MediaStore;
* ML Kit;
* native workers;
* background processing;
* Swift;
* Kotlin;

somente porque Expo Go não suporta.

Expo Go é uma conveniência de desenvolvimento.

Não é requisito de produção.

---

# Expo Prebuild / CNG

Preferir configuração declarativa utilizando:

```text
app.config.ts

config plugins

Expo Prebuild
```

Sempre que possível, evitar editar manualmente:

```text
Info.plist
AndroidManifest.xml
Podfile
build.gradle
AppDelegate
MainApplication
```

Se alguma configuração nativa for necessária, preferir um:

```text
Expo Config Plugin
```

---

# Native folders

Preferencialmente utilizar Continuous Native Generation.

Ou seja:

```text
app.config.ts
+
config plugins
+
Expo Modules
       ↓
expo prebuild
       ↓
ios/
android/
```

Não fazer modificações manuais desnecessárias nos projetos gerados.

Se alguma necessidade futura justificar abandonar parcialmente CNG, documentar através de ADR.

---

# Monorepo

Criar:

```text
seleva-ai/

apps/
  mobile/

packages/
  core/
  database/
  photo-engine/
  ui/

modules/
  seleva-photo-engine/

docs/
  adr/

tooling/

package.json
pnpm-workspace.yaml
turbo.json
```

Use:

```text
pnpm
Turborepo
```

Não criar dezenas de packages prematuramente.

---

# apps/mobile

Criar o aplicativo Expo em:

```text
apps/mobile
```

Estrutura sugerida:

```text
apps/mobile/

app/
  _layout.tsx
  index.tsx

  search.tsx
  clean.tsx
  library.tsx
  settings.tsx

src/
  components/
  features/
  hooks/
  services/
  stores/
  theme/
  i18n/

app.config.ts
package.json
```

Utilizar:

# Expo Router

como navegação principal.

---

# Responsabilidades do Expo / React Native

React Native deve controlar:

```text
UI
navigation
onboarding
state
user preferences
QueryPlan
filters
search
cleanup flows
preview
selection
ranking
settings
localization
```

---

# Responsabilidades nativas

Swift e Kotlin devem controlar:

```text
photo library access
image processing
thumbnail generation
OCR
image analysis
hashing
background indexing
memory management
native AI integrations
trash/delete
```

---

# Expo Module próprio

Criar um módulo local:

```text
modules/
  seleva-photo-engine/
```

Estrutura conceitual:

```text
seleva-photo-engine/

src/
  index.ts
  types.ts

ios/
  SelevaPhotoEngineModule.swift
  PhotoLibraryService.swift
  PhotoScanner.swift
  VisionAnalyzer.swift

android/
  src/main/java/.../
    SelevaPhotoEngineModule.kt
    PhotoLibraryService.kt
    PhotoScanner.kt
    MLAnalyzer.kt
```

Usar:

# Expo Modules API

para expor funcionalidades nativas ao React Native.

Evitar escrever TurboModule manualmente se Expo Modules resolver adequadamente.

---

# PhotoEngine

Criar uma abstração TypeScript compartilhada.

```ts
export interface PhotoEngine {
  getCapabilities(): Promise<DeviceCapabilities>

  requestPermission(): Promise<PhotoPermission>

  startScan(
    options: ScanOptions
  ): Promise<ScanJob>

  pauseScan(
    jobId: string
  ): Promise<void>

  resumeScan(
    jobId: string
  ): Promise<void>

  cancelScan(
    jobId: string
  ): Promise<void>

  getAssets(
    query: PhotoQuery
  ): Promise<PaginatedPhotos>

  getThumbnail(
    assetId: string,
    options?: ThumbnailOptions
  ): Promise<string>

  trashAssets(
    assetIds: string[]
  ): Promise<TrashResult>
}
```

---

# Regra crítica

NUNCA processe a biblioteca foto por foto atravessando JS ↔ Native.

ERRADO:

```text
JS
 ↓
photo 1
 ↓
native
 ↓
result
 ↓
JS
 ↓
photo 2
```

CORRETO:

```text
React Native

startScan()

       ↓

Expo Native Module

       ↓

Native worker

photo 1
photo 2
photo 3
...
photo 50,000

       ↓

SQLite

       ↓

progress event
```

---

# Eventos nativos

Expo Module deve emitir eventos como:

```text
scanProgress
scanCompleted
scanFailed
scanPaused
```

Exemplo:

```ts
interface ScanProgressEvent {
  jobId: string
  processed: number
  total: number
  progress: number
}
```

Evitar enviar informações desnecessárias para JS.

---

# Escala

Projetar desde o início para:

```text
50,000+ photos/videos
```

O aplicativo não pode depender de carregar a biblioteca inteira em memória.

---

# packages/core

Criar domínio independente do React Native.

Implementar:

```text
PhotoAsset
PhotoAnalysis
PhotoQuality
PhotoCluster

DeviceCapabilities

PhotoPermission

ScanJob
ScanOptions
ScanStatus

PhotoQuery
PhotoQueryPlan

CleanupCandidate
CleanupReason

PhotoEngine
IntentProvider
```

---

# PhotoAsset

Criar:

```ts
export interface PhotoAsset {
  id: string

  mediaType:
    | "photo"
    | "video"

  createdAt: number

  modifiedAt?: number

  width: number
  height: number

  duration?: number

  fileSize?: number

  isFavorite?: boolean

  latitude?: number
  longitude?: number
}
```

Não expor diretamente:

```text
PHAsset
MediaStore internals
```

ao TypeScript.

---

# Banco local

Usar:

# SQLite

Não utilizar Firebase, Supabase ou banco cloud para a biblioteca.

Criar migrations.

Tabelas iniciais:

```text
photos

photo_analysis

photo_labels

photo_clusters

scan_jobs

cleanup_history

user_preferences
```

---

# photos

Campos sugeridos:

```text
id

platform_asset_id

media_type

created_at
modified_at

width
height

duration
file_size

favorite

latitude
longitude

indexed_at
```

---

# photo_analysis

Campos:

```text
photo_id

blur_score

quality_score

brightness_score

face_count

ocr_text

is_screenshot

is_document

perceptual_hash

analysis_version

model_version

analyzed_at
```

---

# FTS

Criar:

# SQLite FTS5

para o OCR.

Exemplo:

```text
GitHub
Jira
PIX
WhatsApp
Slack
Nota Fiscal
```

Busca:

```text
"Jira"
```

deve ser resolvida diretamente pelo banco quando possível.

---

# Acesso à galeria no iOS

Implementar usando:

```text
PhotoKit
```

Responsabilidades:

```text
permissions
limited library permissions
asset enumeration
metadata
thumbnail loading
change detection
trash/delete
```

Não copiar os arquivos para dentro do aplicativo.

---

# Acesso à galeria no Android

Implementar com:

```text
MediaStore
```

Responsabilidades:

```text
permissions
asset enumeration
metadata
thumbnail access
change detection
trash/delete
```

Não copiar a biblioteca para armazenamento interno.

---

# Permissões

Criar onboarding que explique:

```text
SelevaAI analyzes your library directly on your phone.

Your photos are never uploaded.
```

Tratar corretamente:

```text
denied
limited
full
```

quando aplicável.

---

# Config Plugins

Criar config plugins para declarar:

```text
iOS photo permissions

Android media permissions

background capabilities

native ML requirements
```

Sempre que possível, configuração deve existir em:

```text
app.config.ts
+
plugins
```

---

# Scanner

Implementar scanner nativo.

Características obrigatórias:

```text
batch processing
checkpoint
pause
resume
cancel
progress
incremental scanning
recovery
bounded memory
```

---

# ScanJob

```ts
export interface ScanJob {
  id: string

  processed: number
  total: number

  status:
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed"

  startedAt: number
  updatedAt: number
}
```

Persistir no SQLite.

---

# Resume

Exemplo:

```text
17,532 / 42,621
```

Se o app fechar, deve conseguir continuar sem reiniciar tudo.

---

# Indexação incremental

Depois da primeira indexação:

NÃO analisar tudo novamente.

Identificar:

```text
new
changed
deleted
```

assets.

---

# Análise incremental

Persistir:

```text
analysis_version
model_version
```

Quando algoritmo mudar:

reprocessar somente registros incompatíveis.

---

# Thumbnail first

NUNCA carregar a imagem original se thumbnail for suficiente.

Para análise:

```text
224x224
384x384
512x512
```

dependendo do algoritmo.

Liberar buffers rapidamente.

---

# iOS analysis engine

Utilizar:

```text
Vision
```

para funcionalidades adequadas.

Preparar arquitetura para:

```text
Core ML
Foundation Models
```

posteriormente.

---

# Android analysis engine

Utilizar:

```text
ML Kit
```

para funcionalidades adequadas.

Preparar arquitetura para:

```text
Gemini Nano / ML Kit GenAI
```

posteriormente.

---

# Screenshots

Implementar detecção de screenshots.

Preferir:

```text
metadata
album/system information
dimensions
native properties
```

antes de heurísticas visuais pesadas.

---

# Duplicatas

Implementar:

## Exact duplicate

Hash apropriado.

## Visual duplicate

Perceptual hashing:

```text
pHash
dHash
```

ou técnica equivalente.

## Similar photos

Agrupar imagens muito similares em clusters.

Arquitetura preparada para embeddings posteriormente.

---

# Blur

Implementar detecção local.

Pode usar:

```text
Laplacian variance
```

ou técnica semelhante.

Gerar:

```text
blurScore
```

normalizado.

---

# Quality Score

Criar:

```ts
interface PhotoQuality {
  overall: number
  blur: number
  brightness: number
  faceQuality?: number
}
```

Inicialmente pode ser heurístico.

Arquitetura deve permitir evoluir.

---

# Vídeos grandes

Criar:

```text
Large Videos
```

Permitir:

```text
sort by size
estimated recoverable space
preview
selection
```

---

# OCR

## iOS

Utilizar:

```text
Vision Text Recognition
```

## Android

Utilizar:

```text
ML Kit Text Recognition
```

Persistir resultado no SQLite FTS.

---

# Não use LLM por foto

NUNCA faça:

```text
photo
 ↓
LLM
```

para milhares de fotos.

LLM local será usado principalmente para interpretar intenção.

---

# DeviceCapabilities

Implementar:

```ts
export interface DeviceCapabilities {
  platform:
    | "ios"
    | "android"

  photoLibrary: boolean

  ocr: boolean

  faceDetection: boolean

  imageClassification: boolean

  embeddings: boolean

  nativeLLM: boolean

  backgroundIndexing: boolean

  performanceTier:
    | "low"
    | "medium"
    | "high"
}
```

---

# Compatibility tiers

## Tier A

Aparelhos antigos:

```text
metadata
screenshots
OCR
blur
hashes
duplicates
SQLite
rules
```

---

## Tier B

Adicionar futuramente:

```text
embeddings
clustering
semantic search
advanced classification
```

---

## Tier C

Aparelhos modernos:

```text
Apple Foundation Models
Gemini Nano
```

Nunca tornar Tier C obrigatório.

---

# Intent Engine

Criar:

```ts
export interface IntentProvider {
  parse(
    prompt: string
  ): Promise<PhotoQueryPlan>
}
```

---

# Primeiro provider

Implementar:

```text
RuleIntentProvider
```

antes de qualquer LLM.

Suportar:

```text
English
Portuguese
Spanish
```

---

# Exemplos

```text
screenshots
prints
capturas de tela
```

→

```text
screenshot = true
```

---

```text
blurry
borradas
desenfocadas
```

→ filtro de blur.

---

```text
older than one year
mais de um ano
más de un año
```

→ filtro temporal.

---

# PhotoQueryPlan

```ts
export interface PhotoQueryPlan {
  target?: {
    minSpaceToRecover?: number
    maxResults?: number
  }

  filters?: {
    before?: number
    after?: number

    mediaTypes?: Array<
      "photo" |
      "video"
    >

    screenshot?: boolean

    duplicate?: boolean

    similar?: boolean

    hasFaces?: boolean

    labels?: string[]

    ocrTerms?: string[]

    maxQuality?: number

    minBlur?: number

    minFileSize?: number
  }

  exclusions?: {
    favorites?: boolean

    importantPeople?: boolean
  }

  ranking?: {
    strategy:
      | "largest"
      | "worst-quality"
      | "most-redundant"
      | "least-important"
  }
}
```

---

# Segurança

Nunca:

```text
AI
 ↓
DELETE
```

Fluxo obrigatório:

```text
Prompt

↓

QueryPlan

↓

Candidates

↓

Preview

↓

User Selection

↓

Confirmation

↓

Native OS Confirmation

↓

Trash
```

---

# CleanupCandidate

Criar:

```ts
export interface CleanupCandidate {
  photoId: string

  confidence: number

  reasons: CleanupReason[]

  recoverableBytes?: number
}
```

---

# Explainability

O usuário deve conseguir entender:

```text
Why was this selected?
```

Exemplo:

```text
Old screenshot

Not favorite

No faces

2 years old

Similar image exists
```

---

# Exclusão

Preferir:

```text
Trash
```

antes de permanent delete.

Utilizar APIs nativas do sistema.

Nunca realizar exclusão silenciosa.

---

# UI

Visual:

```text
premium
clean
minimal
consumer
modern
friendly
```

Referência conceitual:

```text
Apple Photos
+
Google Photos
+
AI Assistant
```

Não utilizar estética:

```text
antivirus
junk cleaner
rocket booster
red warnings everywhere
```

---

# Design system

Criar package:

```text
packages/ui
```

Contendo:

```text
tokens
spacing
typography
components
cards
buttons
inputs
photo-grid
```

Evitar overengineering.

---

# Home

Criar:

```text
SelevaAI

Find. Select. Keep.

What would you like to do?
```

Campo:

```text
Ask Seleva...
```

Quick actions:

```text
Free up space

Clean screenshots

Find duplicates

Find blurry photos

Review large videos
```

---

# Dashboard

Exemplo:

```text
32,487 Photos

4,291 Videos

28.7 GB recoverable
```

Categorias:

```text
Screenshots

Duplicates

Similar

Blurry

Large Videos
```

---

# Expo Router

Criar navegação inicial:

```text
Home

Search

Clean

Library

Settings
```

Preferencialmente usando tabs.

---

# Search

Suportar inicialmente:

```text
OCR
date
metadata
media type
screenshots
```

Posteriormente:

```text
semantic search
natural language
```

---

# Library

Criar grid performático.

Obrigatório:

```text
virtualization
pagination
lazy thumbnails
selection
```

Não colocar dezenas de milhares de assets no React state.

---

# Zustand

Utilizar apenas para:

```text
UI state
filters
selection
scan status
preferences
```

SQLite continua sendo source of truth para assets.

---

# First scan

UX:

```text
Analyzing your library

14,621 / 37,229
```

Mensagem:

```text
Everything stays on your phone.
```

---

# Expo Development Build

Assim que o primeiro Expo Module nativo for criado:

configurar development builds corretamente.

Adicionar:

```text
expo-dev-client
```

e scripts para:

```text
android dev build
ios dev build
```

---

# Scripts

Criar scripts claros como:

```text
pnpm dev

pnpm dev:android

pnpm dev:ios

pnpm prebuild

pnpm lint

pnpm typecheck

pnpm test
```

A nomenclatura pode ser ajustada desde que permaneça clara.

---

# Expo Go

Enquanto ainda for possível:

```text
pnpm dev
```

pode abrir no Expo Go.

Depois da introdução dos native modules:

o caminho oficial passa a ser Development Build.

Documentar isso no README.

---

# README

Explicar claramente:

## UI-only development

Pode usar Expo Go enquanto não depender de native custom modules.

## Full SelevaAI development

Requer Development Build.

Exemplo conceitual:

```text
pnpm prebuild
pnpm dev:ios
```

ou:

```text
pnpm dev:android
```

---

# Não depender de EAS

EAS pode ser utilizado futuramente, mas:

não deve ser requisito obrigatório para desenvolvimento local.

O projeto deve conseguir:

```text
prebuild
build
run
```

localmente.

---

# EAS futuramente

Arquitetura deve ser compatível com:

```text
EAS Build
EAS Submit
EAS Update
```

mas não configurar serviços desnecessários durante o MVP.

---

# i18n

Preparar:

```text
en
pt-BR
es
```

desde o começo.

English como fallback.

Nenhuma string importante hardcoded.

---

# Backend

Não implementar backend inicialmente.

Não criar:

```text
Supabase
Firebase database
AWS
Node API
```

sem necessidade.

---

# Não implementar no MVP

Não implementar ainda:

```text
login
authentication
cloud sync
billing
subscription
OpenAI
Gemini Cloud
Claude
upload de photos
face identity recognition
custom LLM
complex analytics
```

---

# Testes

## TypeScript

Jest.

Testar:

```text
QueryPlan
intent parsing
filters
ranking
cleanup candidates
```

## Database

Testar:

```text
migrations
repositories
pagination
FTS
```

## iOS

XCTest para código crítico nativo.

## Android

JUnit para código crítico nativo.

---

# Fixtures

Criar assets/dados sintéticos para testar:

```text
screenshots
duplicates
similar photos
blurry photos
OCR
large videos
favorites
```

Não exigir fotos pessoais.

---

# Performance

Sempre considerar:

```text
50,000+ assets
```

Não aceitar arquitetura que:

```text
carregue tudo em RAM

carregue tudo no JS

envie buffers pela bridge

analise imagens grandes no JS

execute loops enormes na UI thread
```

---

# Battery

Indexação deve:

```text
work in batches
be cancellable
avoid unnecessary reprocessing
persist progress
release resources
```

---

# Privacy

Nunca enviar:

```text
photos
videos
thumbnails
OCR contents
faces
locations
image labels
```

para analytics.

---

# Logs

Não logar:

```text
OCR
private asset paths
photo contents
GPS
personal metadata
```

---

# Documentação

Criar:

```text
docs/

architecture.md

privacy.md

database.md

photo-engine.md

query-engine.md

performance.md
```

---

# ADRs

Criar:

```text
docs/adr/

001-expo.md

002-expo-development-builds.md

003-expo-modules.md

004-native-photo-processing.md

005-sqlite.md

006-local-first.md
```

---

# Ordem de implementação

## STEP 1 — Monorepo

Criar:

```text
pnpm workspace
Turborepo
apps/mobile
packages/core
packages/database
packages/photo-engine
packages/ui
```

---

# STEP 2 — Expo app

Criar aplicativo Expo.

Configurar:

```text
TypeScript
Expo Router
Hermes
i18n
Zustand
theme
Jest
lint
formatter
```

Neste momento o projeto deve poder abrir no Expo Go.

---

# STEP 3 — UI foundation

Implementar:

```text
Home
Search
Clean
Library
Settings
```

com navegação funcional.

Ainda pode ser mock.

---

# STEP 4 — Core domain

Criar:

```text
PhotoAsset
PhotoAnalysis
DeviceCapabilities
ScanJob
QueryPlan
CleanupCandidate
PhotoEngine
IntentProvider
```

Testar.

---

# STEP 5 — Database

Configurar SQLite.

Criar:

```text
schema
migrations
repositories
FTS
```

---

# STEP 6 — Expo Native Module

Criar:

```text
seleva-photo-engine
```

usando Expo Modules API.

A partir daqui:

# mudar desenvolvimento principal para Expo Development Build.

Configurar dev-client.

---

# STEP 7 — iOS PhotoKit

Implementar:

```text
permissions
library access
asset listing
metadata
pagination
thumbnails
```

---

# STEP 8 — Android MediaStore

Implementar:

```text
permissions
library access
asset listing
metadata
pagination
thumbnails
```

---

# STEP 9 — Library screen real

Substituir mocks.

Conectar:

```text
PhotoEngine
SQLite
native thumbnails
```

---

# STEP 10 — Scanner

Implementar:

```text
batching
progress events
checkpoint
resume
cancel
incremental scan
```

---

# STEP 11 — Screenshot detection

Implementar e persistir.

---

# STEP 12 — Duplicate detection

Implementar:

```text
exact duplicate
pHash/dHash
visual grouping
```

---

# STEP 13 — Blur detection

Implementar nativamente.

---

# STEP 14 — Large videos

Implementar.

---

# STEP 15 — OCR

Implementar:

```text
Vision
ML Kit
FTS
```

---

# STEP 16 — Search

Criar busca real usando índice local.

---

# STEP 17 — Cleanup

Implementar:

```text
candidate
preview
selection
confirmation
trash
```

---

# STEP 18 — Rule Intent Engine

Implementar comandos em:

```text
English
Portuguese
Spanish
```

---

# STEP 19 — Ask Seleva

Conectar:

```text
prompt
 ↓
IntentProvider
 ↓
QueryPlan
 ↓
SQLite
 ↓
results
```

---

# STEP 20 — Capability Engine

Detectar capabilities.

Preparar:

```text
AppleFoundationModelProvider

GeminiNanoProvider
```

sem torná-los requisitos.

---

# STEP 21 — Polish

Melhorar:

```text
performance
UX
loading states
empty states
errors
permissions
accessibility
localization
```

---

# Validação após cada etapa

Sempre executar quando aplicável:

```text
lint

typecheck

tests
```

Depois que houver native code:

também validar:

```text
Android build

iOS build
```

Corrigir os erros antes de continuar.

---

# Não pare na scaffold

Não quero apenas:

```text
folder structure
package.json
placeholder components
```

Continue implementando o próximo passo.

Avance o máximo possível dentro da sessão.

---

# Git

Trabalhar em alterações pequenas e coerentes.

Sugestões de commits:

```text
chore(repo): initialize SelevaAI monorepo

feat(mobile): add Expo Router foundation

feat(core): add photo domain contracts

feat(database): add local photo index

feat(photo-engine): create Expo native module

feat(ios): integrate PhotoKit library

feat(android): integrate MediaStore library

feat(scan): add incremental photo scanner

feat(cleanup): detect duplicate photos
```

---

# Definition of Done do MVP

O MVP estará pronto quando for possível:

```text
install SelevaAI

open app

grant photo permissions

index library

resume interrupted scan

detect new assets

view library

find screenshots

find duplicates

find similar photos

find blurry photos

find large videos

search OCR

enter simple natural-language queries

preview cleanup

select assets

confirm deletion

move assets to trash
```

Tudo isso:

```text
without backend

without paid AI API

without uploading photos
```

---

# Critério de arquitetura

Quando houver conflito entre:

```text
share more JavaScript code
```

e:

```text
better native performance
```

no photo engine:

**prefira native performance.**

Quando for:

```text
UI
domain
business rules
query logic
```

prefira compartilhamento em TypeScript.

---

# Critério para Expo

Expo deve aumentar produtividade.

Expo não deve limitar o produto.

Use:

```text
Expo Router
Expo Config Plugins
Expo Development Builds
Expo Prebuild
Expo Modules API
```

quando agregarem valor.

Não force:

```text
Expo Go compatibility
```

depois que o produto exigir native code.

---

# Forma de trabalhar

Para cada etapa:

```text
1. implemente

2. execute validações

3. corrija problemas

4. documente decisões importantes

5. avance
```

Não fique apenas propondo o que poderia ser feito.

Faça.

---

# Primeira tarefa

Comece agora.

Crie o monorepo do SelevaAI utilizando:

```text
pnpm
Turborepo
Expo
React Native
TypeScript
Expo Router
```

Configure primeiro uma versão que consiga abrir no Expo Go para desenvolvimento de UI.

Depois implemente o domínio e SQLite.

Em seguida crie o primeiro Expo Native Module:

```text
seleva-photo-engine
```

e migre o fluxo principal de desenvolvimento para:

# Expo Development Build.

Então implemente PhotoKit e MediaStore.

Não tente manter compatibilidade com Expo Go depois desse ponto se isso prejudicar funcionalidades nativas.

Continue avançando pelas etapas deste documento.

---

# North Star

Todas as decisões devem respeitar:

**Private.**

**Local-first.**

**Offline-first.**

**Fast on huge libraries.**

**Native where performance matters.**

**Shared where product logic matters.**

**Compatible with older devices.**

**Expo for productivity, not as a limitation.**

**No paid AI dependency.**

**Never delete without explicit user confirmation.**

# SelevaAI

## Find. Select. Keep.
