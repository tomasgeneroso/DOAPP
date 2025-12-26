# DoApp Mobile

Aplicación móvil de DoApp desarrollada con React Native + Expo.

## 📱 Requisitos

- Node.js 18+
- npm o yarn
- Expo Go (para testing en dispositivo físico)
- Android Studio (para emulador Android)
- Xcode (para simulador iOS, solo Mac)

## 🚀 Instalación

```bash
cd mobile
npm install
```

## 🏃 Desarrollo

### Opción 1: Expo Go (Recomendado para testing rápido)

1. Instalar la app **Expo Go** en tu celular (disponible en App Store y Play Store)
2. Ejecutar:
   ```bash
   npm start
   ```
3. Escanear el código QR con tu celular

### Opción 2: Emulador

```bash
# Android
npm run android

# iOS (solo Mac)
npm run ios
```

### Opción 3: Web (para desarrollo rápido)

```bash
npm run web
```

## 📁 Estructura de Carpetas

```
mobile/
├── app/                    # Pantallas (Expo Router)
│   ├── (auth)/            # Pantallas de autenticación
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── forgot-password.tsx
│   ├── (tabs)/            # Pantallas principales con tabs
│   │   ├── index.tsx      # Home
│   │   ├── search.tsx     # Búsqueda
│   │   ├── create.tsx     # Publicar
│   │   ├── messages.tsx   # Chat
│   │   └── profile.tsx    # Perfil
│   ├── _layout.tsx        # Layout raíz
│   └── index.tsx          # Splash/Router
├── components/            # Componentes reutilizables
│   ├── ui/               # Componentes de UI (botones, inputs)
│   ├── job/              # Componentes de trabajos
│   └── chat/             # Componentes de chat
├── context/              # React Context
│   └── AuthContext.tsx
├── hooks/                # Custom hooks
├── services/             # Servicios de API
│   ├── api.ts           # Cliente HTTP base
│   ├── auth.ts          # Autenticación
│   └── jobs.ts          # Trabajos
├── types/               # TypeScript types
│   └── index.ts
└── assets/              # Imágenes, fonts
```

## 🔗 Conexión con Backend

La app se conecta al mismo backend que la web:

```
API: https://doapparg.site/api
```

Para desarrollo local:
```bash
# En mobile/.env
EXPO_PUBLIC_API_URL=http://192.168.X.X:3001/api
```

## 📦 Build para Producción

### Configurar EAS

```bash
# Instalar EAS CLI
npm install -g eas-cli

# Login en Expo
eas login

# Configurar proyecto
eas build:configure
```

### Generar builds

```bash
# Android APK/AAB
npm run build:android

# iOS IPA
npm run build:ios

# Ambos
npm run build:all
```

## 🔔 Push Notifications

Las notificaciones push usan Firebase Cloud Messaging (FCM), igual que la web.

## 📝 Scripts

| Script | Descripción |
|--------|-------------|
| `npm start` | Inicia servidor de desarrollo |
| `npm run android` | Abre en emulador Android |
| `npm run ios` | Abre en simulador iOS |
| `npm run web` | Abre en navegador |
| `npm run build:android` | Build Android con EAS |
| `npm run build:ios` | Build iOS con EAS |

## 🎨 Temas

La app soporta modo claro y oscuro automáticamente según la configuración del dispositivo.

## 📄 Licencia

Todos los derechos reservados.
