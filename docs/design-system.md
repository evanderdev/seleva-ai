# Tema SelevaAI

A navegação agora contém somente Home, Library e Settings. FoundationScreen,
LibraryPermissionCard, LibraryIndexCard, LibrarySummaryCard e as rotas /search e
/clean foram removidas. LibraryStatus substitui o painel antigo de gestão.

LibraryProvider solicita permissão na primeira abertura, executa metadados nativos
e depois análise quando há itens pendentes. Cada lote aguarda confirmação do commit
SQLite. O progresso e os insights aparecem na Home enquanto a biblioteca é preparada.

A economia estimada considera apenas cópias exatas excedentes, preservando favoritas
e uma cópia por hash. Vídeos grandes são itens para revisão, não economia garantida.
Tamanhos desconhecidos não geram bytes estimados; PhotoKit ainda não fornece o tamanho
dos originais nesta leitura. Nada é selecionado ou removido automaticamente.

A enumeração reinicia após interrupções; retomada eficiente e análise incremental por
asset continuam pendentes. A API nova exige Development Build atualizado; Swift requer
validação em macOS/Xcode.

O design system fica em `packages/ui/src/index.tsx`: paletas semânticas light/dark,
espaçamento, largura de conteúdo, tipografia, Card, Button, Icon e IconButton.
ThemeProvider acompanha a preferência persistida no SQLite. As primitivas são React
Native, conforme a arquitetura vigente; não há dependência DOM/Radix no runtime nativo.

## Conexões

- Home: prompt local, atalhos para vídeos grandes, similares, capturas, borradas e
  duplicatas. Três thumbnails locais abrem a biblioteca. Preparação, progresso e
  estimativas aparecem diretamente no layout novo.
- Resultados: FlatList de duas colunas, até 60 itens por página, seleção individual ou da
  página, prévia ampliada e faixa dos itens selecionados. Lixeira mantém confirmação no
  app e na API nativa; histórico contabiliza somente os itens efetivamente removidos.
- Buscar no cabeçalho e Editar filtro abrem o mesmo painel inferior, com teclado,
  fechamento pelo fundo/voltar, validação Zod e o mesmo parser usado na Home.
- Configurações: aparência e idioma persistidos localmente; falha ao salvar é apresentada
  e não aplica uma preferência que não foi persistida.

Todos os textos estão em messages (en, pt-BR, es). A data usa o locale ativo.
As fotos, nomes e números ilustrativos das referências não são dados do produto:
a implementação utiliza thumbnails locais e contagens reais da página. Não há perfil
com nome pessoal; a saudação é genérica. A estimativa conservadora de duplicatas é
calculada no SQLite. Os atalhos exibem contagens disponíveis, sem inventar grupos.

## Verificação

Typecheck nos seis pacotes, ESLint e 50 testes Jest passaram. O APK Android com as novas
APIs nativas foi compilado. Isso não valida build nativo iOS ou equivalência visual pixel a
pixel. O dispositivo Android conectado estava bloqueado durante a tentativa de inspeção.
A comparação visual final e a interação com teclado/escala de fonte no aparelho ficam
pendentes. Nenhuma foto foi movida para a lixeira durante as verificações.
