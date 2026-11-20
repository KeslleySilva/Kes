#!/usr/bin/env bash
# Baixa, compila e inicia a API oficial da Receita Federal
# (github.com/ReceitaFederal/calculadora-rtc-regime-regular) em http://localhost:8080/api
#
# Uso: scripts/instalar_api_oficial.sh [diretorio-destino]
# Requisitos: git e Java 21+ (o projeto oficial pede Java 25; com Java 21–24
# o script compila com --release do Java instalado, o que foi testado com a v1.7.2).
set -euo pipefail

DEST="${1:-$HOME/calculadora-rtc-regime-regular}"
REPO="https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git"

if [ -d "$DEST/.git" ]; then
  echo ">> Atualizando $DEST"; git -C "$DEST" pull --ff-only
else
  echo ">> Clonando $REPO"; git clone --depth 1 "$REPO" "$DEST"
fi
cd "$DEST"

JAVA_VER=$(java -version 2>&1 | grep -oE 'version "[0-9]+' | grep -oE '[0-9]+$')
echo ">> Java $JAVA_VER detectado"
if [ "$JAVA_VER" -lt 21 ]; then echo "Java 21 ou superior é necessário." >&2; exit 1; fi
EXTRA=""
if [ "$JAVA_VER" -lt 25 ]; then EXTRA="-Djava.version=$JAVA_VER -Dmaven.compiler.release=$JAVA_VER"; fi

MVN="./mvnw"; command -v mvn >/dev/null 2>&1 && MVN="mvn"

echo ">> Gerando o banco SQLite oficial (Flyway)"
mkdir -p ./calculadora/db
rm -f ./calculadora/db/calculadora-pro.db
$MVN -q -B flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf $EXTRA

echo ">> Compilando"
$MVN -q -B clean package -DskipTests -Djacoco.skip=true $EXTRA

echo ">> Iniciando em http://localhost:8080/api (Swagger: /api/swagger-ui.html)"
exec java -Dspring.profiles.active=offline -jar target/api-regime-geral.jar
