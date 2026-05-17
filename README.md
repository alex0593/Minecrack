# 🎮 Minecrack

![Minecrack Version](https://img.shields.io/badge/version-1.3.0-emerald?style=for-the-badge)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202.0-blue?style=for-the-badge&logo=tauri)
![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=for-the-badge&logo=react)
![Rust](https://img.shields.io/badge/Backend-Rust-black?style=for-the-badge&logo=rust)

**Minecrack** es un lanzador alternativo para Minecraft diseñado para ser rápido, ligero y muy fácil de usar. Su objetivo principal es permitirte gestionar diferentes versiones del juego, instalar mods de manera sencilla y personalizar tu experiencia al máximo, todo desde una interfaz moderna y amigable.

Ya sea que quieras jugar la versión más reciente, revivir versiones clásicas o probar paquetes de mods (modpacks), Minecrack te da las herramientas para hacerlo con un par de clics.

---

## ✨ Características Principales

- **🛡️ Juega a tu manera (Modo Offline):** Entra al juego rápidamente sin necesidad de una cuenta de Microsoft, ideal para jugar en redes locales con amigos.
- **📦 Múltiples Versiones:** Crea y organiza diferentes instalaciones de Minecraft (instancias) para jugar distintas versiones sin que interfieran entre sí.
- **🛠️ Listo para Mods:** Juega con tus mods favoritos fácilmente. Compatible con **Vanilla, Fabric, Quilt y Forge/NeoForge** de forma automática.
- **🌐 Catálogo de Modpacks Integrado:** Busca, descubre e instala miles de modpacks directamente desde CurseForge y Modrinth sin salir de la aplicación.
- **👕 Skins Personalizados:** Usa tus propias apariencias (skins) en el juego incluso jugando sin conexión.
- **🚀 Rápido y Optimizado:** Descargas veloces y configuración automática (como la detección de Java) para que entres a jugar lo antes posible sin lidiar con configuraciones complejas.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Frontend** | React 19 + Vite | Interfaz de usuario reactiva y ultra-rápida. |
| **Backend** | Rust (Tauri 2.0) | Gestión de archivos, procesos nativos y descargas. |
| **Estilos** | Vanilla CSS | Diseño personalizado con variables CSS y estética Emerald Dark. |
| **Estado** | React Context + useReducer | Gestión de estado global centralizada en `store.jsx`. |
| **IPC** | Tauri Invoke/Listen | Comunicación fluida y segura entre JS y Rust. |

---

## 📁 Estructura del Proyecto

```bash
Minecrack/
├── src-tauri/             # Backend nativo en Rust
│   ├── src/main.rs        # Punto de entrada y comandos Tauri
│   └── tauri.conf.json    # Configuración de la aplicación nativa
├── src/                   # Frontend en React
│   ├── components/        # UI: Sidebar, MainPanel, Modals
│   ├── lib/               # Lógica de negocio (loaders, launcher, mojang api)
│   ├── hooks/             # Hooks personalizados para persistencia y lanzamiento
│   └── store.jsx          # Estado global de la aplicación
└── public/                # Recursos estáticos
```

---

## 🚀 Desarrollo e Instalación

### Requisitos Previos

- [Rust & Cargo](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (v18+)
- [Java 17+](https://adoptium.net/) (Para ejecutar Minecraft)

### Configuración del Entorno

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/minecrack.git
   cd minecrack
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura las variables de entorno:
   ```bash
   cp .env.example .env
   # Edita .env con tus claves de API si es necesario
   ```

### Comandos Disponibles

- `npm run dev`: Inicia el servidor de desarrollo de Vite y la ventana de Tauri.
- `npm run build`: Genera el ejecutable nativo para tu sistema operativo.
- `npm run tauri`: Acceso directo al CLI de Tauri.
- `npm run test`: Ejecuta la suite de pruebas unitarias con Vitest.

---


## 📚 Documentación de Desarrollo

- **Arquitectura y Proyecto:**
  - [`CLAUDE.md`](./CLAUDE.md): Guía principal de arquitectura, IPC (React-Rust), manejo de estado global y el estado actual de implementaciones (Fase 4).

---

## 📄 Licencia

Este proyecto es para fines educativos y de uso personal. Minecraft es una marca registrada de Mojang Synergies AB.
