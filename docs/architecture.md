# Arquitetura

A [especificação atual](specification.md) determina Expo SDK 57, RN 0.86.3, React 19.2.3,
Expo Router, CNG e Expo Modules API. A base RN CLI inicial foi migrada.

| Diretório                   | Responsabilidade                                          |
| --------------------------- | --------------------------------------------------------- |
| apps/mobile/app             | Rotas Expo Router: Home, Search, Clean, Library, Settings |
| apps/mobile/src             | UI, i18n, preferências e composição do banco              |
| packages/core               | Domínio e schemas, independente de React Native           |
| packages/database           | Migrations, SQL paginado e repositórios                   |
| packages/photo-engine       | Validação e adapter de acesso nativo                      |
| modules/seleva-photo-engine | Expo Module Swift/Kotlin                                  |
| packages/ui                 | Componentes nativos composáveis e tokens                  |

Metro usa `expo/metro-config` com suporte de monorepo; pnpm é hoisted.
Pastas nativas são reproduzidas por `expo prebuild`. Permissões vêm de config plugin
TypeScript; descrições iOS têm três traduções. Não há configuração manual permanente de Gradle/Plist.

Expo Go suporta UI/SQLite, com módulo customizado opcional e indisponibilidade explícita.
Development Build é o fluxo completo. Nem EAS nem backend são necessários.
Hermes e New Architecture seguem o padrão obrigatório do SDK atual.

App inicializa SQLite/migrations antes de expor telas, hidrata idioma e oferece retry em falha.
Zustand não recebe assets. Interfaces nativas validam respostas antes de enviá-las à UI.
Não há formulário de busca funcional nesta etapa; futuros formulários usarão Zod também no serviço local.

Timestamps: epoch milliseconds; bytes para tamanho; segundos para duração. IDs de domínio opacos.
Mínimos de SO são definidos pelo SDK/driver; compatibilidade em aparelhos antigos requer validação real.
Veja os ADRs para as decisões e MEMORY.md para a distinção entre código escrito e validação executada.
