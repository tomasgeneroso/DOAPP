# Railway Deployment Troubleshooting

## Estado Actual del Código

✅ **Build local exitoso**: `npm run build` funciona correctamente
✅ **TypeScript compilado**: Output en `dist/server/`
✅ **railway.json configurado**: Build y start commands correctos
✅ **Errores TypeScript críticos resueltos**: Upload, PayPal, Auth

---

## Checklist de Diagnóstico Railway

### 1. Verificar Variables de Entorno en Railway

Ve a: **Railway Dashboard → Tu Proyecto → Variables Tab**

**Variables REQUERIDAS (mínimo):**
```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<mínimo 32 caracteres>
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
```

**Sin estas 4 variables, el security check fallará.**

### 2. Verificar Status del Deployment

En Railway Dashboard:
1. Click en tu servicio
2. Ve a **"Deployments"** tab
3. Revisa el último deployment:
   - ¿Está en estado "Building"?
   - ¿Está en "Failed"?
   - ¿Está en "Success" pero no arranca?

### 3. Revisar Logs de Railway

En Railway Dashboard → Deployments → Click en el último deployment:

**Build Logs:**
- Buscar errores en `npm install`
- Buscar errores en `npm run build`
- Verificar que compile TypeScript exitosamente

**Deploy Logs:**
- Buscar errores en `npm start`
- Verificar conexión a MongoDB
- Buscar errores de variables de entorno

---

## Problemas Comunes y Soluciones

### ❌ Error: "Missing required variables"

**Causa:** Variables de entorno no configuradas en Railway

**Solución:**
1. Ve a Railway Dashboard → Variables
2. Agrega las 4 variables requeridas:
   ```
   MONGODB_URI
   JWT_SECRET
   PAYPAL_CLIENT_ID
   PAYPAL_CLIENT_SECRET
   ```
3. Railway redeplegará automáticamente

---

### ❌ Error: "npm ERR! Build failed"

**Causa:** Error en el build de TypeScript o Vite

**Solución:**
Verifica que localmente funcione:
```bash
npm run build
```

Si falla localmente, los errores deben corregirse antes de deployar.

---

### ❌ Error: "MongoDB connection failed"

**Causa:** MongoDB URI incorrecto o IP no whitelisted

**Solución:**
1. Ve a MongoDB Atlas → Network Access
2. Agrega `0.0.0.0/0` (permitir todas las IPs)
3. Verifica que tu connection string sea correcto:
   ```
   mongodb+srv://usuario:password@cluster.mongodb.net/doapp?retryWrites=true&w=majority
   ```
4. Asegúrate de reemplazar `usuario` y `password` con tus credenciales

---

### ❌ Error: "Application failed to start"

**Causa:** El servidor no arranca en el puerto correcto

**Solución:**
Railway asigna automáticamente la variable `PORT`. Verifica que tu código use:
```javascript
const PORT = process.env.PORT || 5000;
```

---

### ❌ Build exitoso pero "Railway no hace el deploy"

**Posibles causas:**

1. **No hay cambios en GitHub:**
   ```bash
   git status  # Verificar cambios pendientes
   git log --oneline -5  # Ver últimos commits
   ```

2. **Railway no está conectado al repo correcto:**
   - Ve a Railway → Settings → Service Settings
   - Verifica que esté conectado a tu repo de GitHub
   - Verifica que la branch sea correcta (origin)

3. **Deployment automático deshabilitado:**
   - Ve a Railway → Settings → Service Settings
   - Busca "Deploy Triggers"
   - Asegúrate que "Watch Paths" incluya todos los archivos

4. **Deployment manual requerido:**
   - En Railway Dashboard
   - Click en tu servicio
   - Click en "⋮" (tres puntos)
   - Selecciona "Redeploy"

---

## Comandos de Verificación Local

Antes de deployar, ejecuta estos comandos localmente:

```bash
# 1. Verificar que el build funciona
npm run build

# 2. Verificar que los archivos se generaron
ls dist/server/

# 3. Verificar que el servidor arranca (requiere .env configurado)
npm start

# 4. Verificar TypeScript (warnings son OK, errors NO)
npx tsc --noEmit
```

---

## Estructura Esperada Después del Build

```
dist/
├── assets/          # Frontend assets (Vite)
├── index.html       # Frontend HTML (Vite)
└── server/          # Backend compilado (TypeScript)
    ├── config/
    ├── middleware/
    ├── models/
    ├── routes/
    ├── services/
    ├── utils/
    └── index.js     # ← Entry point del servidor
```

---

## Información del Proyecto

- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Entry Point**: `dist/server/index.js`
- **Puerto**: Railway asigna automáticamente via `PORT` env var
- **Node Version**: Detectado automáticamente por Nixpacks

---

## Pasos para Forzar Re-deployment

Si Railway no detecta cambios:

1. **Método 1: Push vacío**
   ```bash
   git commit --allow-empty -m "Trigger Railway deployment"
   git push
   ```

2. **Método 2: Manual desde Railway**
   - Railway Dashboard → Tu Servicio
   - Click "⋮" → "Redeploy"

3. **Método 3: Cambiar variable de entorno**
   - Railway Dashboard → Variables
   - Agrega una variable temporal: `REDEPLOY=1`
   - Guarda (esto triggerea un nuevo deployment)
   - Puedes eliminarla después

---

## Obtener Ayuda

Si el problema persiste:

1. **Copia los logs de Railway:**
   - Build logs completos
   - Deploy logs completos
   - Runtime logs

2. **Verifica la configuración:**
   - Screenshot de tus variables de entorno (sin mostrar valores)
   - Screenshot del deployment status

3. **Información adicional:**
   - ¿Es la primera vez que deployeas?
   - ¿Funcionaba antes y dejó de funcionar?
   - ¿Qué cambios hiciste recientemente?

---

## Siguiente Paso

**¿Cuál es el error exacto que ves en Railway?**

Ve a Railway Dashboard y dime:
1. ¿En qué estado está el deployment? (Building/Failed/Success/Crashed)
2. ¿Qué dice el último mensaje de error en los logs?
3. ¿Las 4 variables de entorno requeridas están configuradas?

Con esta información puedo ayudarte específicamente.
