# Ambiente Android local no Windows

O diretório ignorado `.tools` contém JDK Temurin 17, Android SDK 36, build-tools 36.0.0,
platform-tools, NDK 27.1.12297006 e CMake 3.22.1. JDK e ferramentas de linha de comando
foram baixados das distribuições oficiais e tiveram checksum verificado.
Não houve alteração permanente de JAVA_HOME/PATH do usuário.

Com Node 22.22.0 ou compatível, depois de `pnpm prebuild`:

```sh
pnpm build:android:local
```

O script usa somente o ambiente local já instalado. Não instala dependências do SO.
O build Gradle pode baixar dependências Maven. Configura JAVA_HOME, ANDROID_HOME e cache
Gradle apenas no processo filho. Gera variante debug para arm64-v8a.

O plugin `withWindowsNativeBuild` coloca o staging CMake do app em `.tools/cxx`
no Windows, evitando o limite de 260 caracteres encontrado no codegen do Gesture Handler.
A configuração é reaplicada pelo prebuild; não editar o Gradle gerado. O cache Gradle
fica em `.g`. O build mantém o projeto e o `node_modules` no mesmo caminho original,
pois o codegen do React Native rejeita raízes diferentes (por exemplo, projeto em `S:`
e dependências em `C:`).

Neste computador, enquanto o Node global não for atualizado:

```sh
npm.cmd exec --yes --package=node@22.22.0 --package=pnpm@9.15.0 -- pnpm build:android:local
```

Em outro computador, configure Android Studio/JDK/SDK e use `pnpm dev:android`;
os binários de `.tools` não pertencem ao repositório. Metro ignora `.tools` para não
observar os arquivos grandes do SDK. iOS continua exigindo macOS/Xcode.
