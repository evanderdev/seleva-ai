# Photo Engine

`modules/seleva-photo-engine` implementa Expo Modules API; o workspace é vinculado por
autolinking como dependência. Não há TurboModule manual.

Funções atuais: getCapabilities, getPermission, requestPermission, listAssets, queryAssets,
getThumbnail, trashAssets, startScan e stopScan.
iOS usa PhotoKit authorization readWrite e distingue acesso limitado/restrito.
Android trata READ_EXTERNAL_STORAGE até API 32, permissões separadas de fotos/vídeos
na API 33 e acesso selecionado na API 34+. Autorização parcial de um tipo também é limitada.
A UI consulta novamente ao voltar do sistema; solicitação somente após ação explícita.

Capacidades de análise não implementadas retornam false. photoLibrary indica disponibilidade
da API de acesso; não significa que scanner/indexação estejam prontos. performanceTier é
uma heurística de RAM, não benchmark. Não inferir disponibilidade de LLM pela memória.

Adapter TypeScript aceita payload unknown e valida Zod; erros não vazam paths ou metadata.
No Expo Go, ausência de módulo produz DEVICE_UNSUPPORTED, sem crash intencional ou sucesso simulado.

O scanner nativo percorre a biblioteca em lotes de até 200 metadados e emite scanBatch,
scanProgress, scanCompleted, scanPaused, scanCancelled e scanFailed. O adapter valida os
payloads com Zod e o app grava cada lote no SQLite em uma transação. O cursor do último lote
fica em scan_jobs para retomada. O worker também calcula blur, brilho, pHash, hash de conteúdo
e OCR local em lotes, persistindo somente os resultados compactos no SQLite. A ação de lixeira
exige confirmação explícita na UI e remove o item do índice local após a chamada nativa.
Código nativo precisa compilar/rodar em ambos os sistemas antes de marcar esta etapa concluída.

listAssets retorna no máximo 200 metadados. Android usa keyset por ID MediaStore decrescente
e data de captura com fallback para data de importação. iOS usa snapshot PHFetchResult lazy,
enumerando só a página solicitada. Mudanças na biblioteca invalidam o cursor iOS (INVALID_CURSOR).
O snapshot é de uma sessão, não um checkpoint de scanner.

getThumbnail valida o acesso antes de gerar/cachear. iOS não baixa originais do iCloud.
Tamanho solicitado: 32–512 px; Android legado usa MINI_KIND, limitado pelo sistema.
Cache privado limitado a 200 arquivos e aproximadamente 24 MB, com remoção dos mais antigos.
Não passar buffers ou originais ao JavaScript. A única mutação da biblioteca é a ação explícita
de lixeira iniciada pelo usuário; thumbnails continuam em cache privado do app.

A aba Library exibe uma página de 60 itens via FlatList. Não acumula toda a biblioteca em
estado React. A Home inicia o scanner nativo e mostra o progresso; quando há dados indexados,
consultas de fotos, vídeos e datas usam SQLite. Screenshots e favoritos continuam usando o
filtro nativo até a análise persistida existir.

## Busca e revisão por metadados

`queryAssets(limit, cursor, category, before)` aceita all/photos/videos/screenshots/favorites
e um limite temporal exclusivo em milissegundos. Zod valida no adapter e Swift/Kotlin
validam novamente na entrada nativa. Cursores não podem ser reutilizados com outro filtro.
Filtros executam antes da paginação; nenhum loop JS percorre a biblioteca.

iOS usa predicates de PhotoKit, incluindo o subtipo screenshot. Android usa seleção SQL
parametrizada e heurística de nome/pasta para screenshots (sujeita a falsos positivos e negativos).
Favoritos exigem Android 11+; versões anteriores retornam DEVICE_UNSUPPORTED.
Referências: [PHFetchOptions](https://developer.apple.com/documentation/photos/phfetchoptions)
e [MediaColumns](https://developer.android.com/reference/android/provider/MediaStore.MediaColumns).

Buscar permite combinar categoria e idade superior a um ano. Limpar permite abrir uma
prévia de até 512 pixels, selecionar itens da página atual e confirmar o envio para a lixeira;
mudar página/filtro ou sair da tela limpa a seleção. Ainda não há exclusão permanente, OCR ou
detecção de duplicatas.
Tamanho só é mostrado quando o provider o fornece; não consultar APIs privadas PhotoKit
nem baixar originais para estimar bytes. Vídeos mostram thumbnail e duração, sem reprodução.

É necessário reconstruir o Development Build para disponibilizar queryAssets. Um binário
antigo retorna indisponibilidade no adapter, sem fallback para resultados sem filtro.
