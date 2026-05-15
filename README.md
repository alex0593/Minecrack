# 🎮 Minecrack

![Minecrack Version](https://img.shields.io/badge/version-1.0.0-emerald?style=for-the-badge)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202.0-blue?style=for-the-badge&logo=tauri)
![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=for-the-badge&logo=react)
![Rust](https://img.shields.io/badge/Backend-Rust-black?style=for-the-badge&logo=rust)

**Minecrack** es un lanzador de Minecraft de alto rendimiento y código abierto, diseñado para la gestión eficiente de múltiples instancias y la personalización extrema. Construido sobre **Tauri 2.0** y **React 19**, ofrece una experiencia nativa ligera con una interfaz moderna y oscura.

---

## ✨ Características Principales

- **🛡️ Modo Offline Nativo:** Juega sin necesidad de autenticación de Microsoft. Generación automática de perfiles y UUIDs offline compatibles.
- **📦 Gestión de Instancias:** Crea, configura y lanza múltiples versiones de Minecraft de forma independiente.
- **🛠️ Soporte Multicargador:** Integración completa con **Vanilla**, **Fabric**, **Quilt** y **Forge/NeoForge** (Vía Prism Meta API y resolución robusta).
- **🌐 Navegador Unificado de Modpacks:** Explora e instala modpacks desde CurseForge y Modrinth directamente desde la interfaz.
- **👕 Skins Automáticos offline:** Integración con CustomSkinLoader para usar skins personalizados (PNG) directamente en el launcher.
- **🚀 Lanzamiento Optimizado:** Detección automática de JRE (Java 17+), construcción dinámica de Classpath y deduplicación de argumentos JVM.
- **📥 Sistema de Descargas en Dos Fases:**
  1. **Fase de Librerías:** Descarga concurrente de binarios y dependencias nativas.
  2. **Fase de Assets:** Descarga masiva de texturas y sonidos (~3000 archivos) con verificación SHA1.

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

## 🏗️ Arquitectura de Lanzamiento

El flujo de lanzamiento de una instancia sigue estos pasos críticos:
1. **Detección de Java:** Se escanea el sistema en busca de una versión compatible.
2. **Resolución de Variables:** Se procesan placeholders como `${natives_directory}` y `${launcher_name}`.
3. **Classpath Building:** Se genera la cadena de librerías necesaria según la versión y el cargador de mods.
4. **Subprocess Spawn:** El backend de Rust inicia la JVM, capturando los logs para mostrarlos en la consola del launcher vía eventos.

---

## 📚 Documentación de Desarrollo

- **Arquitectura y Proyecto:**
  - [`CLAUDE.md`](./CLAUDE.md): Guía principal de arquitectura, IPC (React-Rust), manejo de estado global y el estado actual de implementaciones (Fase 4).

---

## 📄 Licencia

Este proyecto es para fines educativos y de uso personal. Minecraft es una marca registrada de Mojang Synergies AB.
