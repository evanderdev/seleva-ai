# Verificação do incremento

Revisão contra docs/specification.md, em Windows, com Node 22.22.0 temporário.

## Resultado

- Migração RN CLI → Expo 57/Router/CNG concluída no código.
- SQLite com migration, FTS5, queries e persistência de idioma implementado.
- Módulo local Swift/Kotlin e fluxo de permissões escritos; execução nativa ainda não validada.
- Typecheck passou nos seis pacotes e Jest passou em 17 testes, quatro suítes.
- Lint e checagem de compatibilidade Expo passaram.
- Bundles Expo/Hermes Android e iOS gerados com a UI, SQLite e adapter conectados.
- Autolinking Android e Apple reconhecem SelevaPhotoEngineModule.
- Prebuild Android gera permissões de leitura, bloqueia escrita legada e desativa backup automático.

## Limites da validação

Gradle `:app:assembleDebug` parou antes de compilar, pois JAVA_HOME não está definido
e java não existe no PATH. Android SDK também não foi encontrado nos caminhos convencionais.
Expo recusou Prebuild iOS neste Windows; compilação iOS requer macOS/Xcode.
Não houve teste de dispositivo, verificação visual ou benchmark de biblioteca grande.

O prompt exige validar builds nativos antes de prosseguir. A etapa 6 permanece aberta nessa
validação. Próximo incremento nativo: concluir enumeração PhotoKit/MediaStore, metadata,
paginação e thumbnails, seguido de conexão da galeria e scanner. Não marcar MVP concluído.

Antes de armazenar análises pessoais, concluir a política de backup iOS e a conexão do writer
nativo ao mesmo banco SQLite. Não existe processamento ou exclusão de fotos nesta versão.
