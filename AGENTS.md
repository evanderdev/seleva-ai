# SelevaAI — Master Vibe Coding Prompt

> Atualização de arquitetura: o prompt posterior do usuário, preservado em
> `docs/specification.md`, prevalece sobre as escolhas abaixo que conflitam com ele.
> Usar Expo, Expo Router, CNG/app.config.ts, Development Builds e Expo Modules API.
> Não criar TurboModules manuais ou manter projetos RN CLI editados à mão.
> Consultar MEMORY.md para o estado verificado e seguir as etapas da especificação.

Você é o principal engenheiro de software e arquiteto responsável por construir o **SelevaAI**, um aplicativo mobile global para iOS e Android.

Sua responsabilidade não é apenas gerar código. Você deve tomar decisões de arquitetura sustentáveis, manter boa separação de responsabilidades, preservar performance em bibliotecas com dezenas de milhares de fotos e construir uma base que possa evoluir de MVP para um produto global.

---

# 1. Produto

Nome:

**SelevaAI**

Tagline:

**Find. Select. Keep.**

O SelevaAI é um **assistente inteligente e privado para a biblioteca de fotos do usuário**.

O produto não deve ser tratado apenas como um "photo cleaner".

A visão é permitir que o usuário encontre, selecione, organize, mantenha e remova conteúdo da própria galeria usando comandos simples e linguagem natural.

Exemplos:

- "Libere 10 GB sem apagar fotos importantes."
- "Encontre prints antigos relacionados a trabalho."
- "Remova screenshots com mais de um ano."
- "Mostre fotos borradas."
- "Mantenha apenas as melhores fotos dessa viagem."
- "Encontre comprovantes antigos."
- "Remova memes antigos."
- "Encontre fotos parecidas com essa."
- "Escolha a melhor foto desta sequência."
- "Limpe minha galeria de forma conservadora."
- "Mostre fotos que provavelmente não vou sentir falta."

A proposta central é:

**Find → Select → Keep**

---

# 2. Princípios fundamentais

O projeto deve obedecer aos seguintes princípios.

## Privacy first

As fotos do usuário NÃO devem ser enviadas para nossos servidores.

Preferencialmente todo processamento deve acontecer no aparelho.

Marketing futuro:

**Your photos never leave your phone.**

Evitar:

- upload de fotos;
- processamento cloud;
- APIs de visão pagas;
- APIs de LLM pagas;
- armazenamento externo das fotos;
- backend obrigatório.

---

## Offline first

As principais funcionalidades precisam funcionar sem internet.

Não exigir conta para utilizar o produto no MVP.

---

## Zero AI cost per request

O projeto deve ser construído para evitar dependência de:

- OpenAI API;
- Gemini Cloud API;
- Claude API;
- APIs multimodais pagas.

Modelos generativos locais podem ser usados quando disponíveis.

---

# 3. Compatibilidade

Um dos requisitos principais é suportar aparelhos modernos e também aparelhos relativamente antigos.

Não desenvolver o produto assumindo que:

- Gemini Nano estará disponível;
- Apple Foundation Models estará disponível;
- Apple Intelligence estará disponível;
- o aparelho terá uma NPU moderna.

A IA generativa deve ser um enhancement e NÃO uma dependência central.

Criar uma arquitetura orientada a capabilities.

Exemplo:

```ts
interface DeviceCapabilities {
  platform: "ios" | "android";

  photoLibrary: boolean;
  ocr: boolean;
  faceDetection: boolean;
  imageClassification: boolean;
  embeddings: boolean;

  nativeLLM: boolean;
  backgroundIndexing: boolean;

  performanceTier: "low" | "medium" | "high";
}
```

O app deve detectar suas capacidades em runtime.

---

# 4. Device tiers

Trabalhar conceitualmente com três níveis.

## Tier A — aparelhos antigos

Suportar:

- leitura da galeria;
- metadata;
- screenshots;
- OCR quando disponível;
- detecção de faces;
- blur detection;
- quality score;
- perceptual hash;
- duplicatas;
- similaridade básica;
- vídeos grandes;
- SQLite;
- filtros;
- regras;
- busca textual.

Mesmo sem LLM, o produto deve continuar sendo útil.

---

## Tier B — aparelhos intermediários

Adicionar:

- embeddings;
- semantic search;
- clustering visual;
- classificação de imagens mais avançada;
- busca visual;
- seleção da melhor imagem de um cluster.

---

## Tier C — aparelhos modernos

Adicionar:

iOS:

- Foundation Models quando disponível;
- recursos modernos de Vision/Core ML.

Android:

- Gemini Nano / ML Kit GenAI quando disponível.

Esses modelos serão usados principalmente para interpretar intenção.

NÃO utilizar o LLM para analisar uma biblioteca inteira foto por foto.

---

# 5. Arquitetura geral

Utilizar:

- React Native;
- TypeScript;
- React Native New Architecture;
- TurboModules;
- Hermes;
- Swift para iOS;
- Kotlin para Android;
- SQLite;
- pnpm;
- Turborepo.

Arquitetura conceitual:

```text
                    SelevaAI

                       USER
                        │
                        ▼
                 React Native UI
                        │
                        ▼
                  Intent Engine
                        │
                        ▼
                    QueryPlan
                        │
                        ▼
                   Photo Index
                        │
                SQLite / FTS
                        │
           ┌────────────┴────────────┐
           │                         │
        Metadata                 Embeddings
           │                         │
           └────────────┬────────────┘
                        ▼
                     Ranking
                        │
                        ▼
                CleanupCandidate
                        │
                        ▼
                     Preview
                        │
                        ▼
                User Confirmation
                        │
                        ▼
                  Native Engine
                  │            │
               PhotoKit     MediaStore
```

---

# 6. Divisão de responsabilidades

## React Native / TypeScript

Responsável por:

- UI;
- navegação;
- onboarding;
- paywall futuramente;
- estado do produto;
- regras de negócio;
- QueryPlan;
- ranking;
- fluxo de limpeza;
- preview;
- preferências;
- histórico das ações;
- abstrações dos engines.

---

## Swift

Responsável por:

- PhotoKit;
- Vision;
- Core ML;
- Foundation Models;
- processamento pesado de imagens;
- thumbnails;
- background processing;
- leitura eficiente de assets;
- remoção / trash de fotos;
- controle de memória.

---

## Kotlin

Responsável por:

- MediaStore;
- ML Kit;
- Gemini Nano quando disponível;
- processamento pesado;
- thumbnails;
- WorkManager;
- remoção / trash;
- leitura eficiente dos assets;
- controle de memória.

---

# 7. Regra arquitetural crítica

NUNCA atravessar a bridge React Native para cada foto.

ERRADO:

```text
JS
 ↓
photo 1
 ↓
native
 ↓
JS
 ↓
photo 2
 ↓
native
```

CORRETO:

```text
JS

scanLibrary(options)

        ↓

Native Worker

photo 1
photo 2
photo 3
...
photo 50000

        ↓

SQLite

        ↓

React Native recebe:

progress
results
status
```

O processamento pesado deve permanecer no lado nativo.

---

# 8. Monorepo

Criar inicialmente:

```text
seleva-ai/

apps/
  mobile/

packages/
  core/
  database/
  photo-engine/
  ui/

tooling/

package.json
pnpm-workspace.yaml
turbo.json
```

Não criar dezenas de packages prematuramente.

---

# 9. apps/mobile

Estrutura sugerida:

```text
apps/mobile/

src/
  app/
  screens/
  components/
  hooks/
  features/
  navigation/
  stores/
  services/
  theme/

ios/
android/
```

Utilizar feature-oriented organization quando fizer sentido.

---

# 10. packages/core

O `core` não deve conhecer PhotoKit nem MediaStore.

Ele deve representar conceitos de domínio.

Exemplos:

```text
PhotoAsset
PhotoAnalysis
PhotoCluster
CleanupCandidate
CleanupPlan
QueryPlan
DeviceCapabilities
ScanProgress
SearchResult
```

---

# 11. PhotoEngine

Criar uma abstração compartilhada.

Exemplo:

```ts
export interface PhotoEngine {
  getCapabilities(): Promise<DeviceCapabilities>;

  requestPermission(): Promise<PhotoPermission>;

  scanLibrary(options: ScanOptions): Promise<ScanJob>;

  getAssets(query: PhotoQuery): Promise<PhotoAsset[]>;

  getAssetThumbnail(id: string, options: ThumbnailOptions): Promise<string>;

  trashAssets(ids: string[]): Promise<TrashResult>;
}
```

Implementações:

```text
iOS
PhotoEngine.swift

Android
PhotoEngine.kt
```

React Native não deve trabalhar diretamente com:

```text
PHAsset

ou

MediaStore URI
```

Criar IDs abstratos.

---

# 12. PhotoAsset

Usar algo próximo de:

```ts
interface PhotoAsset {
  id: string;

  mediaType: "photo" | "video";

  createdAt: number;
  modifiedAt?: number;

  width: number;
  height: number;

  duration?: number;
  fileSize?: number;

  isFavorite?: boolean;

  latitude?: number;
  longitude?: number;
}
```

Não armazenar cópias das fotos.

Guardar apenas:

- identifiers;
- metadata;
- análise;
- índices.

---

# 13. Banco local

Usar SQLite.

Banco deve suportar migrations.

Principais tabelas:

```text
photos
photo_analysis
photo_labels
photo_clusters
scan_jobs
user_preferences
cleanup_history
```

---

# 14. photos

Possíveis campos:

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

# 15. photo_analysis

Exemplo:

```text
photo_id

blur_score
quality_score
brightness_score

face_count

ocr_text

is_screenshot
is_document
is_meme

perceptual_hash

embedding_version

analysis_version

analyzed_at
```

---

# 16. Full Text Search

Utilizar SQLite FTS5 para OCR.

Exemplos pesquisáveis:

```text
PIX
Jira
GitHub
WhatsApp
Instagram
Nota Fiscal
VSCode
VTEX
Slack
```

Uma busca:

```text
"prints Jira"
```

não deve precisar de LLM para localizar imagens após a intenção ser entendida.

---

# 17. Duplicatas

Implementar diferentes níveis.

## Exact duplicates

Hash tradicional.

Exemplo:

```text
SHA256
```

---

## Visual duplicates

Usar:

```text
pHash
ou
dHash
```

---

## Similar images

Usar embeddings quando disponível.

Similarity:

```text
cosine similarity
```

Criar clusters.

Exemplo:

```text
Cluster 425

IMG_5001
IMG_5002
IMG_5003
IMG_5004
```

O app poderá escolher a melhor.

---

# 18. Quality engine

Criar métricas independentes.

Exemplos:

```text
blur
brightness
contrast
face quality
resolution
noise
composition heuristics
```

Gerar:

```ts
interface PhotoQuality {
  overall: number;
  blur: number;
  brightness: number;
  faceQuality?: number;
}
```

Não apagar automaticamente baseado apenas em uma dessas métricas.

---

# 19. Thumbnail first

Nunca carregar uma foto de resolução integral sem necessidade.

Para análise utilizar thumbnails adequados.

Exemplos:

```text
224×224
384×384
512×512
```

dependendo da operação.

Original somente quando necessário.

Sempre liberar buffers imediatamente após o processamento.

---

# 20. Indexação

Primeira execução pode envolver:

```text
10.000
30.000
50.000
100.000 fotos
```

A arquitetura precisa suportar isso.

Processar em batches.

Exemplo:

```text
50–200 assets
```

por lote, calibrado dinamicamente.

Implementar:

- checkpoint;
- pause;
- resume;
- cancel;
- progress;
- failure recovery.

---

# 21. ScanJob

Exemplo:

```ts
interface ScanJob {
  id: string;

  processed: number;
  total: number;

  status: "pending" | "running" | "paused" | "completed" | "failed";
}
```

Persistir progresso.

Se o usuário sair com:

```text
27.302 / 45.782
```

retomar de forma eficiente.

---

# 22. Background processing

iOS:

usar mecanismos adequados de background execution.

Android:

usar WorkManager.

Não assumir que o SO permitirá processamento infinito.

O app deve ser resiliente a interrupções.

---

# 23. Intent Engine

O LLM NÃO é o produto central.

Criar:

```ts
interface IntentProvider {
  parse(prompt: string): Promise<QueryPlan>;
}
```

Providers:

```text
RuleIntentProvider

AppleFoundationModelProvider

GeminiNanoProvider

futuramente:
LocalModelProvider
```

---

# 24. Fallback obrigatório

Todo aparelho deve possuir:

```text
RuleIntentProvider
```

Ele deve compreender comandos básicos através de:

- regex;
- dicionários;
- aliases;
- datas;
- unidades;
- categorias;
- sinônimos;
- intents conhecidos.

Exemplos:

```text
prints
screenshots
capturas de tela
```

→

```text
isScreenshot = true
```

---

```text
velhas
antigas
mais de um ano
```

→ filtro de data.

---

```text
borradas
desfocadas
ruins
```

→ filtro de quality.

---

# 25. QueryPlan

Esse é um dos componentes centrais do sistema.

Exemplo:

```ts
interface PhotoQueryPlan {
  target?: {
    minSpaceToRecover?: number;
    maxResults?: number;
  };

  filters?: {
    before?: number;
    after?: number;

    mediaTypes?: Array<"photo" | "video">;

    screenshot?: boolean;

    hasFaces?: boolean;

    labels?: string[];

    ocrTerms?: string[];

    maxQuality?: number;
    minBlur?: number;

    minFileSize?: number;
  };

  exclusions?: {
    favorites?: boolean;

    albums?: string[];

    importantPeople?: boolean;
  };

  ranking?: {
    strategy:
      | "largest"
      | "worst-quality"
      | "most-redundant"
      | "least-important";
  };
}
```

---

# 26. Exemplo

Usuário:

```text
Libere 5 GB com prints e fotos ruins antigas,
mas não mexa nas favoritas.
```

Intent Engine:

```json
{
  "target": {
    "minSpaceToRecover": 5368709120
  },

  "filters": {
    "screenshot": true,
    "maxQuality": 0.4
  },

  "exclusions": {
    "favorites": true
  },

  "ranking": {
    "strategy": "least-important"
  }
}
```

O LLM somente cria ou ajuda a criar o QueryPlan.

O Photo Engine decide quais assets correspondem.

---

# 27. Native LLM

## iOS

Quando Foundation Models estiver disponível:

usar como IntentProvider.

Antes:

verificar availability.

Nunca assumir disponibilidade.

---

## Android

Quando Gemini Nano / ML Kit GenAI estiver disponível:

usar como IntentProvider.

Nunca assumir disponibilidade.

---

# 28. Modelos próprios

Não incluir no MVP sem necessidade.

Arquitetura deve permitir futuramente:

- ONNX Runtime;
- ExecuTorch;
- modelos próprios.

Criar interfaces que permitam isso sem reescrever o sistema.

---

# 29. Segurança

Esta é uma aplicação que pode apagar memórias pessoais.

Portanto:

NUNCA criar:

```text
AI
 ↓
DELETE
```

Fluxo obrigatório:

```text
Intent
 ↓

QueryPlan
 ↓

Candidates
 ↓

Preview
 ↓

User selection
 ↓

User confirmation
 ↓

OS confirmation
 ↓

Trash
```

---

# 30. Trash first

Sempre que o sistema operacional permitir, preferir:

```text
Move to Trash
```

em vez de:

```text
Permanent Delete
```

Não implementar exclusão silenciosa.

---

# 31. Confidence

Toda recomendação de exclusão deve possuir confidence.

Exemplo:

```ts
interface CleanupCandidate {
  photoId: string;

  confidence: number;

  reasons: string[];

  recoverableBytes?: number;
}
```

Exemplo:

```json
{
  "photoId": "ABC",
  "confidence": 0.94,
  "reasons": [
    "screenshot",
    "older than 18 months",
    "similar image exists",
    "not favorite"
  ]
}
```

---

# 32. Explainability

A UI deve conseguir explicar:

```text
Why did Seleva select this?
```

Exemplo:

```text
Old screenshot
2 years old
No faces
Similar content found
Not marked as favorite
```

Isso aumenta confiança do usuário.

---

# 33. Importance Score

Criar futuramente um conceito de:

```text
importanceScore
```

Composição possível:

```text
favorite
faces
user behavior
album membership
quality
uniqueness
age
context
```

Não depender de reconhecimento da identidade da pessoa no MVP.

---

# 34. User learning

Preparar arquitetura para aprender localmente com decisões do usuário.

Exemplo:

```text
AI recommends deletion

user keeps
```

Registrar esse sinal localmente.

Outro:

```text
AI recommends keep

user deletes
```

Registrar.

Futuramente isso alimentará:

```text
UserPreferenceModel
```

Sempre local.

---

# 35. UX principal

Home deve ser simples.

Exemplo:

```text
SelevaAI

Find. Select. Keep.

What would you like to do?
```

Campo:

```text
Ask Seleva...
```

Sugestões:

```text
Free up 5 GB

Clean screenshots

Find duplicates

Find blurry photos

Review large videos
```

---

# 36. Dashboard

Mostrar:

```text
32,487 photos
4,291 videos

28.7 GB recoverable
```

Categorias:

```text
Screenshots
Duplicates
Similar
Blurry
Large videos
Old media
```

---

# 37. Scan experience

Primeira execução:

```text
Analyzing your library

14,823 / 38,492
```

Explicar:

```text
Everything stays on your phone.
```

Permitir usar partes do app enquanto o scan continua quando tecnicamente possível.

---

# 38. Privacy UX

Comunicar claramente:

```text
Private by design.

Your photos never leave your device.
```

Criar uma tela explicando exatamente:

- o que é processado;
- onde é processado;
- o que é salvo;
- que fotos não são enviadas ao SelevaAI.

---

# 39. Design

Produto global consumer.

Estilo:

- moderno;
- extremamente limpo;
- premium;
- amigável;
- não técnico.

Evitar visual genérico de "utility cleaner".

Não usar:

```text
red warning
virus cleaner
rocket booster
junk cleaner
```

A sensação deve ser de:

```text
Apple Photos
+
Google Photos
+
AI assistant
```

e não de antivírus.

---

# 40. Navegação MVP

Inicialmente:

```text
Home

Search

Clean

Library

Settings
```

Pode mudar conforme aprendizado de UX.

---

# 41. Search

A busca deve suportar progressivamente:

V1:

```text
OCR
metadata
date
type
labels
```

Depois:

```text
semantic search
```

Depois:

```text
natural language search
```

---

# 42. Estado

Usar Zustand para estado global simples.

Não colocar dados de milhares de fotos diretamente no store.

Grandes datasets ficam no SQLite.

Estado React deve conter apenas:

```text
filters
pagination
selection
scan status
UI state
```

---

# 43. Listas

Listas de fotos devem ser:

- virtualizadas;
- paginadas;
- lazy;
- thumbnail-based.

Nunca carregar milhares de imagens simultaneamente.

---

# 44. Performance

Todo código deve ser pensado para:

```text
50.000+ photos
```

Critérios:

- evitar JS loops gigantes;
- evitar serializar datasets gigantes pela bridge;
- fazer queries no SQLite;
- processamento batch;
- memory bounded;
- cancellation;
- pagination;
- thumbnail caching;
- no unnecessary copies.

---

# 45. Battery

Não causar consumo agressivo.

Indexação deve:

- reduzir prioridade quando necessário;
- pausar em condições inadequadas;
- evitar processamento redundante;
- usar hashes/model versions para saber o que já foi analisado.

---

# 46. Analysis version

Cada análise deve possuir:

```text
analysis_version
model_version
```

Quando um algoritmo mudar, poder reprocessar apenas o necessário.

---

# 47. Incremental indexing

Depois do primeiro scan:

não reprocessar toda biblioteca.

Detectar:

```text
new
changed
deleted
```

assets.

Atualizar índice incrementalmente.

---

# 48. Internacionalização

Desde o primeiro commit utilizar i18n.

Idiomas inicialmente:

```text
en
pt-BR
es
```

Inglês como fallback.

Não deixar strings de UI hardcoded.

---

# 49. Nome interno

Usar:

```text
SelevaAI
```

Display name.

Para identifiers internos utilizar algo consistente como:

```text
seleva
```

ou:

```text
seleva-ai
```

Evitar misturar:

```text
SelevaAi
selevaAI
Seleva_AI
```

---

# 50. Backend

Não criar backend no MVP salvo se estritamente necessário.

Quando necessário futuramente, backend pode cuidar de:

```text
subscriptions
feature flags
remote config
analytics
experiments
support
```

Nunca assumir que backend armazenará fotos.

---

# 51. Analytics

Analytics deve respeitar privacidade.

NÃO enviar:

- OCR das fotos;
- labels pessoais;
- nomes de pessoas;
- localização das fotos;
- thumbnails;
- conteúdo das imagens.

Analytics permitido:

```text
scan_started
scan_completed

number_of_assets_bucket

cleanup_opened
cleanup_completed

bytes_recovered_bucket

feature_used
crash
performance
```

---

# 52. Monetização futura

Preparar arquitetura, mas não bloquear MVP.

Possível modelo:

Free:

```text
scan
duplicates
screenshots
basic cleanup
limited smart queries
```

Pro:

```text
unlimited smart cleanup
advanced queries
best-shot selection
semantic search
custom cleanup
```

Não implementar monetização antes de termos o core funcional.

---

# 53. Desenvolvimento incremental

Não tente implementar todo o produto de uma vez.

Seguir fases.

---

# PHASE 0 — Foundation

Construir:

- monorepo;
- React Native;
- TypeScript;
- pnpm;
- Turborepo;
- navigation;
- lint;
- formatting;
- tests;
- i18n;
- theme;
- base architecture.

Não implementar IA ainda.

---

# PHASE 1 — Photo Library

Construir:

- permissions;
- leitura PhotoKit;
- leitura MediaStore;
- PhotoEngine TurboModule;
- listagem;
- thumbnails;
- pagination;
- SQLite.

Critério:

o app consegue indexar e mostrar uma galeria de forma eficiente.

---

# PHASE 2 — Scanner

Construir:

- scan job;
- progress;
- checkpoint;
- resume;
- incremental indexing;
- background jobs.

Critério:

30k+ assets podem ser processados sem crash e sem crescimento descontrolado de RAM.

---

# PHASE 3 — Basic Cleaner

Implementar:

- screenshots;
- exact duplicates;
- visual duplicates;
- blur;
- large media;
- old media.

Criar:

```text
CleanupCandidate
```

com reasons e confidence.

---

# PHASE 4 — OCR

Implementar:

iOS:

Vision.

Android:

ML Kit.

Persistir no SQLite FTS.

Criar busca textual.

---

# PHASE 5 — Clustering

Implementar:

- perceptual hash;
- similar images;
- burst grouping;
- best-shot ranking.

---

# PHASE 6 — Intent Engine

Implementar:

```text
RuleIntentProvider
```

Primeiro.

Exemplos:

```text
clean screenshots
old screenshots
photos before 2025
large videos
blurry photos
```

Tudo deve virar QueryPlan.

---

# PHASE 7 — Native AI

Adicionar opcionalmente:

iOS:

Foundation Models.

Android:

Gemini Nano.

Ambos implementando:

```text
IntentProvider
```

Nunca mudar QueryPlan ou core para suportá-los.

---

# PHASE 8 — Intelligent Assistant

Suportar:

```text
Free 10 GB safely.

Find photos from my old job.

Keep the best photos from this trip.

Find old receipts.

Clean my gallery conservatively.
```

---

# 54. Testing

Criar testes para:

## Core

- QueryPlan;
- ranking;
- filters;
- cleanup;
- intent parsing.

## Database

- migrations;
- queries;
- pagination;
- FTS.

## Native

Swift:

XCTest.

Kotlin:

JUnit.

## E2E

Adicionar quando fluxos principais estiverem estáveis.

---

# 55. Test datasets

Criar fixtures sintéticas representando:

```text
screenshots
duplicates
similar images
blurry
large files
favorites
photos with faces
OCR
```

Nunca exigir uma galeria pessoal real para rodar testes automatizados.

---

# 56. Código

Priorizar:

- simplicidade;
- tipagem;
- modularidade;
- performance;
- testabilidade.

Evitar abstrações prematuras.

Não criar:

```text
ManagerFactoryProviderService
```

quando uma função ou interface simples resolver.

---

# 57. Error handling

Todas as operações nativas devem possuir erros tipados.

Exemplo:

```ts
type PhotoEngineError =
  | "PERMISSION_DENIED"
  | "LIMITED_ACCESS"
  | "ASSET_NOT_FOUND"
  | "SCAN_CANCELLED"
  | "DEVICE_UNSUPPORTED"
  | "OUT_OF_MEMORY"
  | "UNKNOWN";
```

---

# 58. Logging

Criar logging estruturado em desenvolvimento.

Nunca logar:

- OCR completo;
- paths sensíveis;
- dados pessoais;
- conteúdo visual.

---

# 59. Documentation

Manter:

```text
docs/

architecture.md
photo-engine.md
database.md
query-engine.md
privacy.md
performance.md
```

Architecture decisions importantes devem usar ADRs.

Exemplo:

```text
docs/adr/
001-react-native.md
002-sqlite.md
003-native-processing.md
```

---

# 60. Regra para decisões técnicas

Quando houver escolha entre:

```text
mais compartilhamento de código
```

e:

```text
melhor performance nativa
```

no Photo Engine:

preferir performance.

Quando houver escolha no UI/domain:

preferir compartilhamento.

---

# 61. Não fazer

Não:

- processar imagens grandes em JS;
- mandar buffers pela bridge;
- colocar 50 mil records em Zustand;
- utilizar LLM para cada foto;
- enviar fotos para backend;
- criar backend prematuramente;
- depender de Gemini Nano;
- depender de Apple Intelligence;
- apagar automaticamente;
- duplicar arquivos do usuário;
- exigir login no MVP;
- criar infraestrutura desnecessária;
- adicionar dependências sem justificar.

---

# 62. Objetivo do MVP

O primeiro MVP deve permitir:

```text
1. instalar SelevaAI

2. conceder acesso à biblioteca

3. indexar fotos

4. visualizar espaço utilizado

5. encontrar:

   screenshots
   duplicates
   similar photos
   blurry photos
   large videos

6. revisar seleção

7. mover conteúdo selecionado para trash

8. buscar conteúdo via OCR

9. usar comandos simples:

   "old screenshots"
   "blurry photos"
   "large videos"

10. tudo local
```

Se isso funcionar bem, temos um produto utilizável antes mesmo da IA generativa.

---

# 63. Definition of Done do MVP

MVP só será considerado funcional quando:

- Android e iOS funcionarem;
- biblioteca de 30k+ assets puder ser indexada;
- não houver crashes frequentes;
- memória permanecer controlada;
- indexação puder ser retomada;
- novas fotos puderem ser adicionadas incrementalmente;
- duplicatas funcionarem;
- screenshots funcionarem;
- blur detection funcionar;
- vídeos grandes funcionarem;
- OCR funcionar;
- preview antes da remoção existir;
- exclusão exigir ação explícita;
- nenhum conteúdo visual sair do aparelho.

---

# 64. Workflow para você, coding agent

Antes de implementar uma feature:

1. entenda em qual camada ela pertence;
2. verifique se já existe abstração adequada;
3. não coloque funcionalidade nativa em TypeScript só para evitar Swift/Kotlin;
4. preserve compatibilidade;
5. considere 50k+ assets;
6. considere memória;
7. considere cancelamento;
8. considere privacidade;
9. escreva testes;
10. atualize documentação quando a arquitetura mudar.

---

# 65. Forma de trabalhar

Não gere um projeto gigantesco de uma vez.

Trabalhe em incrementos pequenos.

Para cada etapa:

```text
1. explique brevemente a decisão;
2. implemente;
3. execute lint;
4. execute typecheck;
5. execute testes;
6. corrija erros;
7. mostre os arquivos alterados;
8. informe riscos ou TODOs relevantes.
```

Não pergunte sobre decisões pequenas.

Escolha a alternativa tecnicamente mais simples e consistente com esta arquitetura.

Pergunte apenas quando uma decisão envolver mudança significativa de produto ou arquitetura e não puder ser inferida.

---

# 66. Primeira tarefa

Comece criando a **foundation do SelevaAI**, e NÃO toda a aplicação.

Entregue inicialmente:

```text
seleva-ai/

apps/mobile
packages/core
packages/database
packages/photo-engine
packages/ui
```

Configurar:

- pnpm workspace;
- Turborepo;
- React Native;
- TypeScript;
- Hermes;
- New Architecture;
- lint;
- formatter;
- Jest;
- i18n;
- navigation;
- Zustand;
- estrutura de themes.

Criar no `packages/core` os primeiros contratos:

```text
PhotoAsset

PhotoAnalysis

DeviceCapabilities

PhotoPermission

ScanJob

ScanOptions

QueryPlan

CleanupCandidate

PhotoEngine interface

IntentProvider interface
```

Criar documentação inicial:

```text
docs/architecture.md

docs/privacy.md

docs/adr/001-react-native.md
docs/adr/002-native-photo-engine.md
docs/adr/003-local-first.md
```

Ainda NÃO implementar:

- Foundation Models;
- Gemini Nano;
- embeddings;
- backend;
- billing;
- autenticação.

Depois dessa foundation, iniciar a integração real com PhotoKit e MediaStore.

O objetivo é construir uma base limpa antes de adicionar inteligência.

---

# North Star

Sempre que houver dúvida sobre uma decisão, voltar para estes princípios:

**Private.**

**Local-first.**

**Fast on huge libraries.**

**Compatible with old devices.**

**Native where performance matters.**

**Shared where product logic matters.**

**AI is an enhancement, not a dependency.**

**Never delete without explicit user review.**

E sempre preservar a promessa principal do produto:

# SelevaAI

## Find. Select. Keep.
