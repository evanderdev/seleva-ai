# Tema SelevaAI

O design system fica em `packages/ui/src/index.tsx`: paletas semânticas light/dark,
espaçamento, largura de conteúdo, tipografia, Card, Button, Icon e IconButton.
ThemeProvider acompanha a preferência persistida no SQLite. As primitivas são React
Native, conforme a arquitetura vigente; não há dependência DOM/Radix no runtime nativo.

## Conexões

- Home: prompt local, atalhos explícitos para vídeos grandes, similares, capturas antigas,
  borradas e duplicatas. Três thumbnails locais abrem a biblioteca. Gerenciar biblioteca
  expande permissões, indexação/retomada e resumo de armazenamento existente.
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
com nome pessoal; a saudação é genérica. Não há estimativa de espaço recuperável ou
contador global de grupos; os atalhos descrevem os filtros disponíveis.

## Verificação

Typecheck nos seis pacotes, ESLint e 40 testes Jest passaram. Bundles Hermes Android
e iOS foram exportados. Isso não valida build nativo iOS ou equivalência visual pixel a
pixel. O dispositivo Android conectado estava bloqueado durante a tentativa de inspeção.
A comparação visual final e a interação com teclado/escala de fonte no aparelho ficam
pendentes. Nenhuma foto foi movida para a lixeira durante as verificações.
