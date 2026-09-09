# Performance

Meta de projeto: 50 mil fotos com memória limitada. Não validada nesta foundation.
Scans usarão batches de até 200; consultas retornam até 200 itens por página.
Próximas fases devem medir memória, cancelamento, retomada e indexação incremental
com fixtures sintéticas e bibliotecas grandes em dispositivos reais.

## Android: separação do trabalho nativo

- `SelevaPhotoEngineModule`: contratos Expo, permissões e encaminhamento das operações.
- `PhotoScanRunner`: enumeração, protocolo de seleção/ACK, progresso e encerramento.
- `PhotoAnalyzer`: OCR e métricas locais, um bitmap por vez. O reconhecedor é reutilizado no lote e fechado em `finally`; o bitmap também é liberado em falhas de análise.
- `PhotoThumbnailStore`: geração e limpeza do cache, isoladas do scanner.
- `PhotoLibraryService`: consultas MediaStore e operação existente de lixeira.
- `PhotoWorker`: três filas seriais independentes (`seleva-scan`, `seleva-thumbnails`, `seleva-library`). O scan usa prioridade de background. Isso é prioridade de CPU; não implementa execução em background/WorkManager.

Lotes de análise têm no máximo 20 assets; metadados mantêm o limite solicitado de até 200.
O worker aguarda o commit SQLite antes do próximo lote. O banco continua usando as APIs
assíncronas existentes; não foi criado outro runtime JavaScript ou banco concorrente.
Atualizações de insights são coalescidas e limitadas a uma por segundo após a primeira
análise disponível. A conclusão e as transições forçam a leitura final.

A célula da galeria (`LibraryGridItem`) e o thumbnail são componentes separados e
memoizados. A tela fornece `renderItem`, abertura e seleção com referências estáveis;
a seleção é indexada por `Set` para evitar buscas lineares repetidas. O `FlatList`
continua limitado a 60 assets por página e mantém `removeClippedSubviews=false` por
causa do crash gráfico já observado.

Pausa normal termina o lote e seu commit. Na destruição do módulo, o scanner libera a
espera por ACK, impede novos eventos e para entre assets. O worker não interrompe uma
tarefa ML Kit que ainda esteja usando o bitmap. Uma operação do provedor/ML Kit que não
retorne ainda pode atrasar o encerramento; cancelamento dessas chamadas exige trabalho
adicional com ownership seguro dos buffers.

Validação deste incremento: lint, typecheck, 66 testes Jest, dois testes JVM de isolamento
e encerramento, APK Android debug arm64 compilado e instalado. App observado aberto
com workers nomeados e sem novo registro no buffer de crash durante a checagem breve.
A automação UIAutomator não conseguiu obter estado ocioso; não houve teste automatizado
completo de navegação. Os registros anteriores incluem SIGSEGV em React Native/Hermes:
a modularização não prova que a causa desses crashes foi eliminada. Ainda medir uso
prolongado, memória em 30k+ assets, navegação durante scan e ciclos de pausa/retomada.
