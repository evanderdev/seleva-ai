# Pré-análise e cache local

A abertura mostra uma tela dedicada de preparação antes de montar a navegação.
Ela informa as etapas de leitura e categorização, com progresso e recuperação de
permissão/falha. A Home é liberada assim que houver resultados analisados salvos;
mostra primeiro o resumo e depois o prompt e os filtros, sem miniaturas da biblioteca.
O índice e as análises ficam no SQLite; cada lote confirmado permanece salvo,
inclusive se o próximo lote falhar ou se o app for interrompido. Resultados parciais
liberam a Home enquanto os próximos lotes continuam no foreground. Cache válido
também libera acesso antes de terminar a análise dos pendentes.

## Etapas

1. Verificar permissão e carregar o resumo persistido.
2. Reutilizar a conclusão de metadados por até seis horas, com acesso autorizado.
   Cache ausente, inválido, expirado, mudança de permissão ou atualização manual
   inicia uma leitura nativa de metadados. Acesso limitado é reconciliado ao reabrir.
3. Havendo análises pendentes, enumerar lotes nativos de até 100 assets.
   O evento `scanBatch` com `requiresAnalysis` grava metadados antes de consultar
   os IDs sem análise válida. `selectScanAssets` envia somente esses IDs ao worker.
4. Swift/Kotlin processam somente os pendentes. O segundo evento do lote persiste
   análises e atualiza clusters em transação SQL antes de liberar o próximo lote.
   O resumo é atualizado sem limpar os resultados anteriores.
5. Somente uma enumeração concluída reconcilia assets removidos. Pausa/falha
   preservam os dados confirmados. Ao reabrir, a consulta de pendentes evita
   repetir análises já concluídas, mesmo que a enumeração reinicie do começo.

Uma análise é válida quando sua data não antecede a modificação do asset e suas
versões de análise/modelo correspondem aos algoritmos nativos atuais. Alterar um
algoritmo exige atualizar também o predicado em `packages/database/src/repository.ts`.
Não houve migration nem nova dependência neste incremento.

## Limites e validação

- Mudanças na galeria dentro das seis horas são descobertas com **Atualizar biblioteca**;
  o próximo acesso após expirar o cache também faz a reconciliação. A expiração dos
  metadados não invalida as análises das fotos que permanecem iguais.
- A enumeração ainda percorre metadados completos quando necessária; não há cursor
  persistente do PhotoKit entre processos nem observador incremental persistente.
- A unidade de progresso é um lote de assets, não etapas independentes de OCR/hash/blur.
  Itens não disponíveis localmente podem continuar pendentes; nesse caso, a tela de
  preparação informa o problema e oferece nova tentativa sem apagar o progresso.
- Os clusters são recalculados em SQL por lote com análise. Medir esse custo e a memória
  em bibliotecas de 30k+ assets continua necessário.
- `pnpm.cmd lint`, `pnpm.cmd typecheck`, 61 testes Jest e
  `pnpm.cmd build:android:local` passaram. O APK debug arm64 contém o novo módulo.
- Swift foi atualizado, mas a compilação iOS exige macOS/Xcode. Validação funcional
  e visual em dispositivo, incluindo pausa/retomada e alterações de acesso, permanece pendente.
- Instalar um novo Development Build para usar `startIncrementalScan` e
  `selectScanAssets`; um módulo antigo é recusado em vez de ignorar o cache.
