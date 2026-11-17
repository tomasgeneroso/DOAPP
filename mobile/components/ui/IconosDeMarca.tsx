import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Los logos de marca de la app, los MISMOS dibujos que usa la web (`public/logo.svg` y los botones de ingreso de `client/pages/LoginScreen.tsx`).
 * Antes la app dibujaba un cuadrado azul con la palabra «DO», la palabra «Google» pintada de colores y un símbolo de texto para X (pedido del dueño, 2026-11-17:
 * «la app no muestra los logos de Google, X y DoApp que tiene la web»).
 */

/** El logo de DOAPP: el círculo celeste con la D y la O. */
export function LogoDoApp({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 300 300" accessibilityLabel="DOAPP">
      <Circle cx={150} cy={150} r={145} fill="#00A8E8" />
      <Path d="M 68 70 L 120 70 Q 160 70 160 150 Q 160 230 120 230 L 68 230 Z" fill="#ffffff" />
      <Circle cx={215} cy={150} r={60} fill="#ffffff" />
    </Svg>
  );
}

/** La «G» de Google, con sus cuatro colores. */
export function IconoGoogle({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Google">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
  );
}

/** El logo de X. Toma el color que se le pase. */
export function IconoX({ size = 20, color = '#000000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="X">
      <Path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill={color} />
    </Svg>
  );
}
