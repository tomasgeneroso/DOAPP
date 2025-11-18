/**
 * Script de diagnóstico para MercadoPago
 * Verifica credenciales y permisos
 */

import dotenv from 'dotenv';
import { MercadoPagoConfig, Preference } from 'mercadopago';

dotenv.config();

const testMercadoPago = async () => {
  console.log('\n🔍 === DIAGNÓSTICO MERCADOPAGO ===\n');

  // Verificar variables de entorno
  const nodeEnv = process.env.NODE_ENV || 'development';
  const testToken = process.env.MERCADOPAGO_ACCESS_TOKEN_TEST;
  const prodToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const testPublicKey = process.env.MERCADOPAGO_PUBLIC_KEY_TEST;
  const prodPublicKey = process.env.MERCADOPAGO_PUBLIC_KEY;

  console.log('📋 Variables de entorno:');
  console.log('  NODE_ENV:', nodeEnv);
  console.log('  MERCADOPAGO_ACCESS_TOKEN_TEST:', testToken ? `${testToken.substring(0, 20)}...` : '❌ NO CONFIGURADO');
  console.log('  MERCADOPAGO_PUBLIC_KEY_TEST:', testPublicKey ? `${testPublicKey.substring(0, 20)}...` : '❌ NO CONFIGURADO');
  console.log('  MERCADOPAGO_ACCESS_TOKEN:', prodToken ? `${prodToken.substring(0, 20)}...` : '❌ NO CONFIGURADO');
  console.log('  MERCADOPAGO_PUBLIC_KEY:', prodPublicKey ? `${prodPublicKey.substring(0, 20)}...` : '❌ NO CONFIGURADO');

  // Determinar qué token usar
  const accessToken = nodeEnv === 'production' ? prodToken : testToken;

  if (!accessToken) {
    console.error('\n❌ ERROR: No hay access token configurado para el ambiente:', nodeEnv);
    console.log('\n💡 Solución:');
    if (nodeEnv === 'production') {
      console.log('  1. Agrega MERCADOPAGO_ACCESS_TOKEN en tu archivo .env');
      console.log('  2. Ejemplo: MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxx');
    } else {
      console.log('  1. Agrega MERCADOPAGO_ACCESS_TOKEN_TEST en tu archivo .env');
      console.log('  2. Ejemplo: MERCADOPAGO_ACCESS_TOKEN_TEST=TEST-xxxxx');
    }
    console.log('  3. Obtén tus credenciales en: https://www.mercadopago.com.ar/developers/panel/credentials\n');
    process.exit(1);
  }

  console.log('\n✅ Token encontrado:', accessToken.substring(0, 20) + '...');
  console.log('  Tipo:', accessToken.startsWith('TEST-') ? 'TEST (Sandbox)' : 'PRODUCCIÓN');

  // Verificar formato del token
  if (nodeEnv !== 'production' && !accessToken.startsWith('TEST-')) {
    console.warn('\n⚠️  ADVERTENCIA: Estás en desarrollo pero usando un token de PRODUCCIÓN');
    console.log('  Esto puede causar problemas. Usa un token TEST- para desarrollo.\n');
  }

  // Intentar crear una preferencia de prueba
  console.log('\n🧪 Intentando crear preferencia de prueba...\n');

  try {
    const client = new MercadoPagoConfig({
      accessToken: accessToken,
      options: {
        timeout: 5000,
      },
    });

    const preferenceService = new Preference(client);

    const testPreference = await preferenceService.create({
      body: {
        items: [{
          title: 'Test - Publicación DOAPP',
          description: 'Prueba de integración MercadoPago',
          quantity: 1,
          unit_price: 1000,
          currency_id: 'ARS',
        }],
        back_urls: {
          success: 'http://localhost:5173/payment/success',
          failure: 'http://localhost:5173/payment/failure',
          pending: 'http://localhost:5173/payment/pending',
        },
        auto_return: 'approved' as const,
        notification_url: 'http://localhost:3001/api/webhooks/mercadopago',
        external_reference: 'test_' + Date.now(),
        statement_descriptor: 'DOAPP',
      },
    });

    console.log('✅ ÉXITO: Preferencia de prueba creada correctamente');
    console.log('  ID:', testPreference.id);
    console.log('  Init Point:', testPreference.init_point);
    console.log('  Sandbox Init Point:', testPreference.sandbox_init_point || 'N/A');

    console.log('\n✨ MercadoPago está configurado correctamente!\n');

  } catch (error: any) {
    console.error('\n❌ ERROR al crear preferencia de prueba:\n');
    console.error('  Mensaje:', error.message);
    console.error('  Código:', error.code);
    console.error('  Status:', error.status);

    if (error.cause && error.cause.length > 0) {
      console.error('\n  Causas del API:');
      error.cause.forEach((cause: any, index: number) => {
        console.error(`    ${index + 1}. ${cause.code}: ${cause.description}`);
      });
    }

    console.log('\n💡 Posibles soluciones:');
    console.log('  1. Verifica que el Access Token sea correcto');
    console.log('  2. Asegúrate de usar credenciales TEST en desarrollo');
    console.log('  3. Verifica que tu cuenta de MercadoPago esté activada');
    console.log('  4. Revisa los permisos de tu aplicación en el panel de MercadoPago');
    console.log('  5. URL del panel: https://www.mercadopago.com.ar/developers/panel/app\n');

    process.exit(1);
  }
};

testMercadoPago();
