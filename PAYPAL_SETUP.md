# PayPal Payment Integration - Setup Guide

Este módulo de pagos con PayPal está completamente configurado y listo para usar. Solo necesitas agregar tus credenciales de PayPal.

## 📋 Características Implementadas

### Backend
- ✅ Modelo de Payment para tracking de transacciones
- ✅ Servicio PayPal con SDK oficial
- ✅ Rutas de API para pagos completas
- ✅ Sistema de escrow para pagos protegidos
- ✅ Reembolsos automáticos
- ✅ Webhooks para eventos de PayPal
- ✅ Cálculo automático de comisión de plataforma
- ✅ Notificaciones automáticas de pago

### Frontend
- ✅ Componente PayPalButton con SDK integrado
- ✅ Modal de pago con detalles completos
- ✅ Historial de pagos (enviados/recibidos)
- ✅ Pantalla de pagos dedicada
- ✅ Vista detallada de contratos con pagos
- ✅ Liberación de escrow desde UI

## 🔧 Configuración de Credenciales

### 1. Obtener Credenciales de PayPal

#### Para Testing (Sandbox):
1. Ve a https://developer.paypal.com/dashboard/
2. Inicia sesión con tu cuenta de PayPal
3. Ve a "Apps & Credentials"
4. En la pestaña "Sandbox", crea una nueva app o usa una existente
5. Copia el "Client ID" y "Secret" del sandbox

#### Para Producción (Live):
1. En el mismo dashboard, cambia a la pestaña "Live"
2. Crea una app de producción
3. Copia el "Client ID" y "Secret" de producción

### 2. Configurar Variables de Entorno

Edita el archivo `.env` en la raíz del proyecto:

```bash
# PAYPAL CONFIGURATION
# Get your credentials from: https://developer.paypal.com/dashboard/

# Para testing: sandbox
# Para producción: live
PAYPAL_MODE=sandbox

# Credenciales del Backend
PAYPAL_CLIENT_ID=tu_paypal_client_id_aqui
PAYPAL_CLIENT_SECRET=tu_paypal_client_secret_aqui

# Porcentaje de comisión de plataforma (ej: 5 para 5%)
PAYPAL_PLATFORM_FEE_PERCENTAGE=5
```

También edita la variable en `.env` para el frontend:

```bash
# Client ID para el SDK de PayPal en el navegador
VITE_PAYPAL_CLIENT_ID=tu_paypal_client_id_aqui
```

**Importante:** Usa el mismo Client ID para ambas variables.

### 3. Cuentas de Prueba (Sandbox)

Para probar en modo sandbox:
1. Ve a https://developer.paypal.com/dashboard/accounts
2. Crea dos cuentas de prueba:
   - Una cuenta "Personal" (comprador)
   - Una cuenta "Business" (vendedor)
3. Usa estas cuentas para probar pagos en sandbox

### 4. Reiniciar el Servidor

Después de configurar las credenciales:

```bash
# Reinicia el servidor backend
npm run dev
```

## 💡 Cómo Usar

### Para Usuarios (Frontend)

1. **Realizar un Pago:**
   - Ve al detalle de un contrato
   - Haz clic en "Realizar Pago"
   - Selecciona tu método de pago en PayPal
   - Confirma el pago

2. **Ver Historial de Pagos:**
   - Haz clic en "Pagos" en el header
   - Filtra por enviados/recibidos
   - Ve detalles de cada transacción

3. **Liberar Escrow:**
   - Ve al detalle del contrato
   - Si el pago está en escrow, verás el botón "Liberar Pago"
   - Confirma para liberar el pago al proveedor

### Para Desarrolladores

#### Crear un Pago
```typescript
import { paymentApi } from '@/lib/paymentApi';

const result = await paymentApi.createOrder({
  contractId: '123',
  amount: 100.00,
  description: 'Pago por servicio'
});

// Redirige al usuario a result.approvalUrl
```

#### Capturar un Pago
```typescript
const result = await paymentApi.captureOrder({
  orderId: 'PAYPAL_ORDER_ID'
});

console.log('Payment captured:', result.captureId);
```

#### Liberar Escrow
```typescript
await paymentApi.releaseEscrow('payment_id');
```

#### Reembolsar un Pago
```typescript
await paymentApi.refundPayment('payment_id', 'Razón del reembolso');
```

## 🔐 Características de Seguridad

- **Escrow System:** Los pagos se pueden mantener en escrow hasta que el cliente confirme
- **Platform Fee:** Comisión automática de plataforma configurable
- **Webhooks:** Validación de eventos de PayPal (implementado en `/api/payments/webhook`)
- **Audit Trail:** Todas las transacciones se registran con timestamps
- **Notificaciones:** Sistema de notificaciones automáticas para todos los eventos de pago

## 📊 Estados de Pago

### Payment Status
- `pending`: Pago iniciado pero no completado
- `processing`: Pago en proceso de confirmación
- `completed`: Pago completado y disponible
- `held_escrow`: Pago retenido en escrow
- `failed`: Pago fallido
- `refunded`: Pago reembolsado

### Contract Payment Status
- `pending`: Sin pago
- `escrow`: Pago en escrow
- `completed`: Pago completado y liberado
- `refunded`: Pago reembolsado

## 🛠️ API Endpoints

### Pagos
- `POST /api/payments/create-order` - Crear orden de pago
- `POST /api/payments/capture-order` - Capturar pago aprobado
- `POST /api/payments/:id/release-escrow` - Liberar escrow
- `POST /api/payments/:id/refund` - Reembolsar pago
- `GET /api/payments/:id` - Obtener detalles de pago
- `GET /api/payments/my/list` - Listar mis pagos
- `GET /api/payments/contract/:contractId` - Pagos de un contrato
- `POST /api/payments/webhook` - Webhook de PayPal

## 📝 Modelos de Datos

### Payment Model
```typescript
{
  contractId: ObjectId,
  payerId: ObjectId,
  recipientId: ObjectId,
  amount: Number,
  currency: String,
  status: String,
  paymentType: String,
  paypalOrderId: String,
  paypalCaptureId: String,
  isEscrow: Boolean,
  platformFee: Number,
  platformFeePercentage: Number,
  // ... más campos
}
```

## 🔄 Flujo de Pago Completo

1. **Cliente crea orden de pago** → `POST /api/payments/create-order`
2. **PayPal genera URL de aprobación** → Cliente redirigido a PayPal
3. **Cliente aprueba el pago** → PayPal redirige de vuelta
4. **Backend captura el pago** → `POST /api/payments/capture-order`
5. **Si escrow está habilitado** → Pago en estado `held_escrow`
6. **Cliente confirma trabajo completado** → `POST /api/payments/:id/release-escrow`
7. **Pago liberado al proveedor** → Estado cambia a `completed`

## 🧪 Testing

### Tarjetas de Prueba (Sandbox)
PayPal proporciona cuentas de prueba automáticamente. No necesitas tarjetas de crédito reales en sandbox.

### Flujo de Prueba
1. Configura el modo sandbox
2. Usa las cuentas de prueba de PayPal
3. Realiza un pago de prueba
4. Verifica que el pago aparece en el dashboard
5. Prueba liberación de escrow
6. Prueba reembolso

## 🚀 Ir a Producción

1. Cambia `PAYPAL_MODE=live` en `.env`
2. Actualiza las credenciales con las de producción
3. Configura webhooks en producción en PayPal Dashboard
4. Prueba con una transacción real pequeña
5. Monitorea los logs para cualquier error

## ⚠️ Notas Importantes

- **Nunca** commits el archivo `.env` a Git
- Las credenciales de sandbox NO funcionan en producción
- El Client ID debe ser el mismo en backend y frontend
- Los webhooks requieren una URL pública (usa ngrok para desarrollo)
- La comisión de plataforma se suma al monto del contrato

## 📞 Soporte

Si tienes problemas:
1. Verifica que las credenciales sean correctas
2. Revisa los logs del servidor para errores
3. Confirma que estés en el modo correcto (sandbox/live)
4. Verifica que el Client ID sea el mismo en backend y frontend

## 🎉 ¡Listo!

El módulo de PayPal está completamente funcional. Solo agrega tus credenciales y ya puedes procesar pagos.
