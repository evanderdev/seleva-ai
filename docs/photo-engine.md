# Photo Engine

`modules/seleva-photo-engine` implementa Expo Modules API; o workspace é vinculado por
autolinking como dependência. Não há TurboModule manual.

Funções atuais: getCapabilities, getPermission, requestPermission.
iOS usa PhotoKit authorization readWrite e distingue acesso limitado/restrito.
Android trata READ_EXTERNAL_STORAGE até API 32, permissões separadas de fotos/vídeos
na API 33 e acesso selecionado na API 34+. Autorização parcial de um tipo também é limitada.
A UI consulta novamente ao voltar do sistema; solicitação somente após ação explícita.

Capacidades de análise não implementadas retornam false. photoLibrary indica disponibilidade
da API de acesso; não significa que scanner/indexação estejam prontos. performanceTier é
uma heurística de RAM, não benchmark. Não inferir disponibilidade de LLM pela memória.

Adapter TypeScript aceita payload unknown e valida Zod; erros não vazam paths ou metadata.
No Expo Go, ausência de módulo produz DEVICE_UNSUPPORTED, sem crash intencional ou sucesso simulado.

scanProgress/scanCompleted/scanFailed/scanPaused são nomes declarados para o futuro scanner;
nenhum evento fictício é emitido. Enumeração, thumbnails, workers, OCR e lixeira ainda não existem.
Código nativo precisa compilar/rodar em ambos os sistemas antes de marcar esta etapa concluída.
