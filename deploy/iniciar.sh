#!/bin/sh
# Sobe a API oficial (porta interna 8080) e a interface web (porta $PORT).
cd /app
java $JAVA_OPTS -Dspring.profiles.active=offline -Dmanagement.server.port=-1 -jar api.jar &
exec python3 ferramenta/servidor.py --porta "${PORT:-8000}" --api http://127.0.0.1:8080/api
