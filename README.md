# SelevaAI

Find. Select. Keep.

Assistente local e privado para bibliotecas de fotos iOS/Android, em desenvolvimento.
Leia [MEMORY.md](MEMORY.md), [AGENTS.md](AGENTS.md) e a [especificação vigente](docs/specification.md).

## Requisitos

- Node 22.22.0 recomendado; o Node 22.9.0 encontrado nesta máquina é insuficiente.
- pnpm 9.15.0 via Corepack.
- Android: Android Studio, JDK e SDK/NDK exigidos pelo projeto Expo gerado; dispositivo ou emulador.
- iOS: macOS, Xcode e CocoaPods. Build iOS não roda no Windows.

```sh
corepack enable
pnpm install --frozen-lockfile
```

No PowerShell com scripts bloqueados, use `pnpm.cmd`/`npm.cmd` sem alterar a política do Windows.
Nesta sessão o tooling foi executado com Node temporário:

```sh
npm.cmd exec --yes --package=node@22.22.0 --package=pnpm@9.15.0 -- pnpm typecheck
```

## Desenvolvimento completo

O fluxo oficial usa Expo Development Build. O módulo próprio não existe no Expo Go.
EAS e conta Expo não são requisitos para build local.

```sh
pnpm prebuild
pnpm dev:android
# No macOS:
pnpm dev:ios
```

Depois de instalar o development client no aparelho:

```sh
pnpm dev
```

Alterações em Swift/Kotlin, plugins ou dependências nativas exigem novo build.
`apps/mobile/android` e `ios` são gerados por CNG e não devem receber edições manuais.
Configuração persistente fica em `app.config.ts`, plugins e `modules/seleva-photo-engine`.

## Desenvolvimento somente da UI

```sh
pnpm dev:go
```

Permite trabalhar na UI, navegação, traduções e SQLite com Expo Go compatível com SDK 57.
Quando o módulo próprio está ausente, o acesso à galeria aparece como indisponível;
não há simulação de permissões, fotos ou scans bem-sucedidos.

## Validação

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm --filter @seleva/mobile exec expo install --check
pnpm --filter @seleva/mobile exec expo export --platform android --platform ios
```

Jest testa contratos, adapter nativo e banco SQLite real usando `node:sqlite` em memória,
sem fotos pessoais. O driver de produção é expo-sqlite. Exportar bundles não valida compilação nativa.

## Entregue e pendente

- Expo 57, Router com cinco abas, Hermes, TypeScript, i18n en/pt-BR/es, UI e Zustand.
- Migrations SQLite, tabelas iniciais, FTS5, repositório paginado, filtros e idioma persistido.
- Expo Module Swift/Kotlin para capacidades e permissões; adapter com validação de retorno.
- CNG, config plugin de permissões e development client local.
- Leitura nativa paginada, thumbnails locais e prévia virtualizada da galeria com 60 itens por página.

O MVP ainda não está pronto. Faltam validação em dispositivo, scanner,
indexação incremental, análise, busca conectada, revisão e lixeira. A tela informa essas limitações.
Compilação e execução nativas precisam ser validadas com SDK/JDK e macOS/Xcode.

A prévia consulta o SO diretamente e não alimenta o índice em loops JavaScript.
O worker nativo de indexação será responsável por popular SQLite. O cache de thumbnails
fica no diretório de cache do app, limitado a 200 arquivos e aproximadamente 24 MB.
Fotos apenas no iCloud podem aparecer sem thumbnail: não são baixadas pela rede.

## Dependências e limites

Expo/Router/dev-client gerenciam runtime e navegação; expo-sqlite fornece o índice local;
Expo Modules expõe Swift/Kotlin; Zod valida fronteiras; Zustand guarda estado pequeno;
i18next fornece messages. Reanimated/Worklets estão alinhados ao SDK por dependências do Router.
pnpm usa hoisting. Nenhum backend, analytics, autenticação, cobrança ou IA cloud foi adicionado.

Detalhes: [arquitetura](docs/architecture.md), [banco](docs/database.md), [engine](docs/photo-engine.md).
