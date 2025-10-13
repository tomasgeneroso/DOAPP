# Solución: MongoDB Atlas IP Whitelist

## Error Actual
```
Could not connect to any servers in your MongoDB Atlas cluster.
One common reason is that you're trying to access the database from an IP that isn't whitelisted.
```

## Solución Inmediata

### Paso 1: Ir a MongoDB Atlas
1. Ve a https://cloud.mongodb.com
2. Inicia sesión
3. Selecciona tu proyecto/cluster

### Paso 2: Configurar Network Access
1. En el menú lateral, click en **"Network Access"**
2. Click en **"+ ADD IP ADDRESS"**
3. Selecciona **"ALLOW ACCESS FROM ANYWHERE"**
4. O ingresa: `0.0.0.0/0`
5. Click **"Confirm"**

### Paso 3: Verificar
- Espera 1-2 minutos para que se aplique
- Railway redesplegará automáticamente o fuerza un redespliegue

## ⚠️ Nota de Seguridad
`0.0.0.0/0` permite conexiones desde cualquier IP. Esto es necesario para Railway porque las IPs cambian dinámicamente. MongoDB Atlas tiene seguridad adicional con usuario/password.

## Alternativa: IP Específica de Railway
Si prefieres mayor seguridad, puedes obtener las IPs de Railway, pero requiere plan pagado:
https://docs.railway.app/reference/public-networking#static-ips
