# Verificação do incremento

Revisão contra docs/specification.md, em Windows, com Node 22.22.0 temporário.

## Resultado

- Migração RN CLI → Expo 57/Router/CNG concluída no código.
- SQLite com migration, FTS5, queries, persistência de idioma, writer de lotes de indexação e
  histórico local de ações de lixeira implementado.
- Módulo local Swift/Kotlin e fluxo de permissões escritos; módulo Kotlin e APK Android debug arm64 compilados.
- Typecheck passou nos seis pacotes e Jest passou em 33 testes, seis suítes.
- Prévia da galeria usa páginas nativas de metadados e thumbnails, sem acumular toda a biblioteca no JS.
- Lint e checagem de compatibilidade Expo passaram.
- Bundles Expo/Hermes Android e iOS gerados com a UI, SQLite e adapter conectados.
- Autolinking Android e Apple reconhecem SelevaPhotoEngineModule.
- Prebuild Android gera permissões de leitura, bloqueia escrita legada e desativa backup automático.

## Limites da validação

O bloqueio inicial por falta de JDK/SDK foi resolvido com ferramentas locais em `.tools`.
O APK Android debug arm64 foi compilado com sucesso e instalado no dispositivo conectado via adb.
Expo recusou Prebuild iOS neste Windows; compilação iOS requer macOS/Xcode.
Ainda não houve verificação visual automatizada nem benchmark de biblioteca grande; o processo
Android permaneceu vivo após a instalação e não registrou exceções fatais no logcat.

O prompt exige validar builds nativos antes de prosseguir. A compilação Android da etapa 6 foi
validada e o APK atualizado com scanner foi instalado no dispositivo conectado; a execução do
fluxo completo de indexação ainda precisa ser observada no aparelho. Compilação iOS permanece
pendente. Enumeração/metadata/thumbnails e o writer SQLite por lotes estão conectados ao app.
O incremento atual conecta a galeria e o dashboard ao índice SQLite quando disponível e adiciona
confirmação explícita para lixeira. OCR, blur e duplicatas agora estão conectados ao worker Android
e ao pipeline SQLite; compilação/validação iOS e análise incremental em background continuam pendentes.

Antes de armazenar análises pessoais, concluir a política de backup iOS e a conexão do writer
nativo ao mesmo banco SQLite. A análise de fotos e a exclusão permanente continuam fora desta versão.
