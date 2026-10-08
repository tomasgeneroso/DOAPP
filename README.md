# 👩‍💻👨‍💻🛠️💸DoApp - Plataforma de Trabajo Freelance

> **Conectando profesionales con clientes de manera segura y eficiente**

DoApp es una plataforma moderna de trabajo freelance que facilita la conexión entre clientes que necesitan servicios y profesionales (Doers) que los ofrecen. Con un sistema de pagos seguro mediante escrow, chat en tiempo real y un robusto sistema de reputación, DoApp garantiza transacciones confiables y transparentes.

---

## 🎯 ¿Qué es DoApp?

DoApp es más que una simple plataforma de trabajos freelance. Es un ecosistema completo diseñado para:

- **Clientes**: Encontrar y contratar profesionales calificados para cualquier tipo de trabajo
- **Doers (Profesionales)**: Ofrecer sus servicios y construir una reputación sólida
- **Todos**: Realizar transacciones seguras con protección de pagos mediante escrow

---

## ✨ Características Principales

### 🔐 Sistema de Escrow (Protección de Pagos)
- Retención segura de pagos hasta la finalización del trabajo
- Liberación automática después de 7 días sin objeciones
- Sistema de aprobación manual del cliente
- Protección para ambas partes de la transacción

### 💬 Chat en Tiempo Real
- Comunicación instantánea entre clientes y doers
- Indicadores de escritura y estado online/offline
- Historial de conversaciones
- Notificaciones en tiempo real

### ⭐ Sistema de Reputación y Confianza
- Calificaciones detalladas (comunicación, profesionalismo, calidad, puntualidad)
- Trust Score basado en comportamiento y desempeño
- Reviews públicas y verificadas
- Badges y logros por buen desempeño

### 🔍 Búsqueda Avanzada
- Filtros por categoría, precio, ubicación, experiencia
- Búsqueda geolocalizada para trabajos locales
- Tags y etiquetas personalizadas
- Sugerencias inteligentes

### 📋 Gestión de Contratos
- Sistema completo de contratos con términos claros
- Negociación de términos antes de aceptar
- Seguimiento de hitos y entregas
- Estados del contrato transparentes

### 🎨 Portfolio Profesional
- Galería de trabajos realizados
- Hasta 10 imágenes por proyecto
- Sistema de likes y visualizaciones
- Trabajos destacados

### 🛡️ Seguridad y Privacidad
- Autenticación con JWT y tokens de refresco
- OAuth integrado (Google, Facebook)
- Rate limiting para prevenir abuso
- Sanitización completa de inputs (XSS protection)
- Auditoría completa de todas las acciones

### 🔔 Notificaciones Multicanal
- Push notifications (Firebase Cloud Messaging)
- Notificaciones por email (SendGrid/Mailgun)
- Notificaciones in-app en tiempo real
- Preferencias personalizables por tipo

### 🌍 Internacionalización
- Soporte multiidioma (Español, Inglés)
- Detección automática de idioma
- Traducciones completas de la interfaz

### 📊 Analytics y Métricas
- Dashboard de métricas para administradores
- Tracking de crecimiento de usuarios
- Análisis de conversiones y pagos
- Google Analytics integrado

---

## 🎭 Roles de Usuario

### 👤 Usuario Regular
- Puede ser cliente o doer (o ambos)
- Crear y aceptar trabajos
- Comunicarse por chat
- Realizar pagos y recibir ingresos
- Dejar y recibir reviews

### 🛠️ Support (Soporte)
- Gestión de tickets de soporte
- Responder consultas de usuarios
- Acceso a reportes básicos

### 🔧 Admin (Administrador)
- Gestión completa de usuarios
- Moderación de contenido
- Resolución de disputas
- Acceso a analytics
- Gestión de tickets

### 👨‍💼 Super Admin
- Todas las funciones de Admin
- Gestión de otros administradores
- Acceso a configuraciones del sistema
- Auditoría completa

### 👑 Owner (Propietario)
- Control total de la plataforma
- Gestión de roles y permisos
- Acceso a todas las funcionalidades
- Configuración de parámetros críticos

---

## 💼 Casos de Uso

### Para Clientes
1. **Publicar un Trabajo**: Describe tu necesidad, establece presupuesto y fecha límite
2. **Recibir Propuestas**: Los doers interesados envían sus propuestas
3. **Negociar Términos**: Ajusta precio, fechas y condiciones antes de aceptar
4. **Pago Seguro**: El dinero se retiene en escrow hasta la finalización
5. **Recibir Trabajo**: Revisa el trabajo entregado
6. **Aprobar y Calificar**: Libera el pago y deja una review

### Para Doers (Profesionales)
1. **Explorar Trabajos**: Busca trabajos que coincidan con tus habilidades
2. **Enviar Propuesta**: Presenta tu oferta y experiencia
3. **Negociar**: Ajusta términos con el cliente si es necesario
4. **Realizar el Trabajo**: Completa el servicio acordado
5. **Entregar**: Marca el trabajo como completado
6. **Recibir Pago**: El dinero se libera automáticamente o por aprobación

### Para Empresas
- Contratar múltiples freelancers
- Gestionar proyectos complejos
- Construir un equipo de colaboradores confiables
- Historial completo de transacciones

---

## 🏆 Ventajas Competitivas

### 🔒 Seguridad Primero
- Sistema de escrow robusto
- Verificación de identidad
- Protección contra fraudes
- Auditoría completa de transacciones

### ⚡ Tecnología Moderna
- Real-time con WebSockets
- Progressive Web App (PWA ready)
- Caché inteligente con Redis
- Optimización automática de imágenes

### 🌟 Experiencia de Usuario
- Interfaz intuitiva y moderna
- Dark mode integrado
- Responsive design (móvil, tablet, desktop)
- Carga rápida y optimizada

### 📈 Escalable
- Arquitectura preparada para alto tráfico
- Caché distribuido
- Rate limiting inteligente
- Microservicios ready

---

## 🛠️ Stack Tecnológico

### Backend
- **Node.js** + **Express** + **TypeScript**
- **MongoDB** con Mongoose ODM
- **Socket.io** para comunicación en tiempo real
- **Redis** para caché y rate limiting
- **JWT** para autenticación segura

### Frontend
- **React 18** + **TypeScript**
- **Vite** para bundling ultra-rápido
- **Tailwind CSS** para estilos
- **React Router v6** para navegación
- **Zustand** para state management

### Integraciones
- **MercadoPago** para pagos (Argentina - principal)
- **PayPal** para pagos (legacy - usuarios antiguos)
- **Firebase Cloud Messaging** para push notifications
- **SMTP (Hostinger)** para emails
- **Google OAuth** y **Facebook Login**
- **Analytics Custom** sin servicios externos (privacy-friendly)
- **Sharp** para optimización de imágenes

### Seguridad
- **Helmet** para headers HTTP seguros
- **Express Rate Limit** + **rate-limiter-flexible**
- **DOMPurify** para sanitización XSS
- **Bcrypt** para hashing de contraseñas
- **Mongo Sanitize** para prevenir inyecciones

---

## 📈 Funcionalidades Avanzadas

### Sistema de Disputas
- Resolución de conflictos estructurada
- Mediación de administradores
- Sistema de evidencias (imágenes, documentos, links)
- Chat interno por disputa
- Reembolsos parciales o totales

### Automatización Inteligente
- Liberación automática de escrow (7 días)
- Recordatorios de aprobación (5 días)
- Detección de contratos vencidos
- Notificaciones automáticas por eventos

### Matching Inteligente
- Códigos de verificación para reuniones presenciales
- Validación de doble factor al reunirse
- Geolocalización de trabajos locales
- Búsqueda por proximidad

### Analytics Completo
- Métricas de plataforma en tiempo real
- Tracking de conversiones
- Análisis de comportamiento de usuarios
- Trust score distribution
- Revenue tracking

---

## 🎨 Características de Diseño

### UI/UX Premium
- Diseño limpio y minimalista
- Animaciones suaves y naturales
- Feedback visual inmediato
- Loading states optimizados
- Error handling elegante

### Accesibilidad
- ARIA labels completos
- Navegación por teclado
- Contraste optimizado
- Screen reader friendly

### Responsive Design
- Mobile-first approach
- Adaptable a cualquier pantalla
- Touch-friendly en móviles
- Desktop optimizado

---

## 🔐 Privacidad y Cumplimiento

- ✅ Protección de datos personales
- ✅ Términos y condiciones claros
- ✅ Política de privacidad transparente
- ✅ GDPR-ready (preparado para cumplimiento)
- ✅ Consentimiento explícito para comunicaciones
- ✅ Derecho al olvido implementable

---

## 📊 Estado del Proyecto

### Fase 1 - MVP ✅ **COMPLETADO**
- Sistema de autenticación completo
- CRUD de trabajos y contratos
- Sistema de pagos con PayPal
- Admin dashboard
- Sistema de tickets
- Seguridad básica

### Fase 2 - Post-MVP ✅ **COMPLETADO**
- Chat en tiempo real
- Notificaciones push y email
- Búsqueda avanzada con filtros
- Geolocalización
- Portfolio/galería
- Sistema de disputas
- Automatización de escrow

### Fase 3 - Optimización ✅ **COMPLETADO**
- Redis caching
- Rate limiting avanzado
- Optimización de imágenes
- Sanitización HTML completa
- Internacionalización (i18n)
- Analytics Custom (sin servicios externos)
- Sistema de publicidad integrado

### Fase 4 - Argentina 🇦🇷 ✅ **COMPLETADO**
- Integración completa de MercadoPago
- Sistema de escrow bidireccional
- Conversión automática USD/ARS
- Sistema de disputas con adjuntos
- Sistema de membresía (PRO, €7/mes)
- Programa de referidos (primeros 1000 usuarios)
- Testing completo (Jest + Supertest + 90+ tests)
- Documentación completa para programadores

### Fase 5 - Futuro 🔮
- Mobile app (React Native)
- PWA completo con offline mode
- AI para matching inteligente
- Sistema de recomendaciones
- Pagos con criptomonedas
- Integración con más pasarelas de pago
- Optimización de performance avanzada

---

## 🌟 Visión del Proyecto

DoApp aspira a ser **la plataforma de referencia para trabajo freelance** en mercados hispanohablantes, combinando:

- **Confianza**: Sistema de escrow y reputación robusto
- **Tecnología**: Stack moderno y escalable
- **Experiencia**: UX intuitiva y agradable
- **Seguridad**: Protección de datos y transacciones
- **Comunidad**: Construcción de una red de profesionales confiables

---

## 👥 Para Quién es DoApp

### ✅ Ideal para:
- 🎨 Diseñadores gráficos y creativos
- 💻 Desarrolladores y programadores
- ✍️ Escritores y redactores
- 📸 Fotógrafos y videógrafos
- 🏠 Servicios de hogar (plomería, electricidad, etc.)
- 🎓 Tutores y profesores
- 🔧 Técnicos y reparadores
- 📊 Consultores y asesores
- Y cualquier profesional independiente

### 🎯 Casos específicos:
- Startups que necesitan talento freelance
- Empresas que buscan contractors
- Profesionales que quieren independencia
- Clientes que necesitan servicios puntuales
- Emprendedores construyendo su cartera

---

## 📚 Documentación

### 🇦🇷 Configuración Argentina

DoApp está **completamente adaptado para Argentina** con:
- **MercadoPago** como sistema de pagos principal
- **Conversión automática USD/ARS**
- **Sistema de membresía** (PRO, €7/mes)
- **Programa de referidos** (primeros 1000 usuarios)
- **Escrow bidireccional** con confirmación de ambas partes
- **Sistema de disputas** con adjuntos y resolución admin

Ver **[README_ARGENTINA.md](./README_ARGENTINA.md)** para detalles completos.

### 📖 Guías Disponibles

**Para Programadores:**
- **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** ⭐ **NUEVO** - Manual completo para programadores
  - Comandos y scripts explicados
  - Creación de usuarios con diferentes roles
  - Workflows de desarrollo
  - Testing y debugging
  - Troubleshooting

**Setup y Deployment:**
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Setup rápido en 5 minutos
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment en producción (VPS, Railway, Render, Heroku)

**📚 Documentación Principal:**
- **[CLAUDE.md](./CLAUDE.md)** - Arquitectura completa y contexto del proyecto
- **[docs/INDEX.md](./docs/INDEX.md)** - 📁 Índice completo de toda la documentación

**🇦🇷 Configuración Argentina:**
- **[docs/README_ARGENTINA.md](./docs/README_ARGENTINA.md)** - Resumen ejecutivo (MercadoPago, CBU)
- **[docs/CBU_ENCRYPTION_IMPLEMENTATION.md](./docs/CBU_ENCRYPTION_IMPLEMENTATION.md)** - Sistema de encriptación de datos bancarios

**🚀 Guías de Inicio:**
- **[docs/SETUP_GUIDE.md](./docs/SETUP_GUIDE.md)** - Instalación y configuración inicial
- **[docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md)** - Guía para desarrolladores
- **[docs/ADMIN_SETUP.md](./docs/ADMIN_SETUP.md)** - Configuración de roles administrativos

**🗄️ Base de Datos:**
- **[docs/CONFIGURAR_POSTGRESQL.md](./docs/CONFIGURAR_POSTGRESQL.md)** - Configuración de PostgreSQL
- **[docs/POSTGRESQL_MIGRATION_COMPLETE.md](./docs/POSTGRESQL_MIGRATION_COMPLETE.md)** - Estado de migración

**🧪 Testing:**
- **[docs/README.md](./docs/README.md)** - Documentación completa de testing

**📋 Historial:**
- **[docs/CHANGELOG.md](./docs/CHANGELOG.md)** - Historial de cambios del proyecto

**🔍 Ver toda la documentación:**
👉 **[docs/INDEX.md](./docs/INDEX.md)** - Índice organizado por categorías

---

## 📞 Contacto

Para más información sobre DoApp o soporte técnico, consulta la documentación técnica en los archivos mencionados arriba.

---

## 📄 Licencia

Este proyecto está bajo desarrollo. Todos los derechos reservados.

---

**DoApp** - *Where Work Gets Done* ✨

---

*Desarrollado con ❤️ usando tecnologías modernas y mejores prácticas de la industria.*
