# Operación del ecosistema

## Despliegue

- Configura TLS en el proxy público y dirige `/api/` al servicio `api`; nunca publiques PostgreSQL.
- Copia `backend/.env.example` a `backend/.env`, cambia contraseña y secreto, y fija `PUBLIC_BASE_URL` al origen público de la API.
- Inicia con `docker compose up -d --build`. El contenedor aplica `alembic upgrade head` antes de aceptar tráfico.
- Comprueba `/health/live`, `/health/ready` y un manifiesto activo antes de distribuir la URL a launchers.

## Respaldo

- PostgreSQL: ejecuta `pg_dump` diariamente y antes de cada migración.
- Archivos: crea snapshots consistentes del volumen `minecrack-files`; los objetos están nombrados por SHA-256.
- Conserva base de datos y volumen como una misma generación de respaldo.

## Publicación y rollback

- Publicar una release cambia el puntero activo de forma transaccional y retira la anterior sin borrarla.
- Para rollback, vuelve a publicar la release anterior desde el panel. Los launchers en modo `active` convergerán a ella en la siguiente sincronización.
- No elimines objetos manualmente. Una futura tarea de recolección deberá borrar únicamente hashes sin referencias.

## Piloto

- Empieza con una instancia Fabric pequeña y un grupo reducido.
- Verifica actualización, JAR corrupto, JAR adicional, interrupción de red y rollback antes del despliegue general.
- Revisa los errores HTTP y `sync://progress`; un fallo nunca debe habilitar “Jugar” para una instancia remota no validada.
