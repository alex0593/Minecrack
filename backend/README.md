# Minecrack Ecosystem API

## Desarrollo

1. Copia `.env.example` a `.env` y cambia todos los secretos.
2. Ejecuta `docker compose up --build` desde la raíz del repositorio.
3. La API queda en `http://localhost:8000`; OpenAPI está en `/docs`.
4. Ejecuta el panel con `cd admin && npm install && npm run dev`.

En producción, usa TLS en el proxy, `COOKIE_SECURE=true`, una contraseña inicial fuerte y un `SESSION_SECRET` aleatorio. Las releases publicadas son inmutables; publicar otra release mueve la anterior a `retired`, pero no borra sus archivos.
