# Imagem única: API oficial da Receita (Java) + interface web (Python).
# Build: docker build -t calculadora-rtc .
# Run:   docker run -p 8000:8000 calculadora-rtc   ->  http://localhost:8000

# ---------- 1. compila a API oficial ----------
FROM maven:3-eclipse-temurin-25 AS build
# versão do repositório oficial (branch, tag ou commit)
ARG RTC_REF=main
ADD https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/archive/${RTC_REF}.tar.gz /tmp/rtc.tar.gz
RUN mkdir /src && tar xzf /tmp/rtc.tar.gz -C /src --strip-components=1
WORKDIR /src
RUN mkdir -p calculadora/db \
 && mvn -q -B flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf \
 && mvn -q -B package -DskipTests -Djacoco.skip=true

# ---------- 2. imagem final: Python + Java 25 (JRE copiado da imagem oficial Temurin) ----------
FROM python:3.12-slim
COPY --from=eclipse-temurin:25-jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk PATH="/opt/java/openjdk/bin:${PATH}"
WORKDIR /app
COPY --from=build /src/target/api-regime-geral.jar /app/api.jar
COPY --from=build /src/calculadora /app/calculadora
COPY ferramenta /app/ferramenta
COPY cenarios /app/cenarios
COPY deploy/iniciar.sh /app/iniciar.sh
RUN chmod +x /app/iniciar.sh
ENV PORT=8000 JAVA_OPTS="-XX:MaxRAMPercentage=55 -XX:+UseSerialGC -Xss512k"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s \
  CMD python3 -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/api/calculadora/dados-abertos/versao' % os.environ['PORT'])" || exit 1
CMD ["/app/iniciar.sh"]
