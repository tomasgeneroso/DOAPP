import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { decisionSeo } from '../../shared/seo/indexacion';

/**
 * Le dice a Google, para la ruta en la que está parado el visitante, si indexarla y cuál es su
 * dirección oficial. Reemplaza al `canonical` y al `robots` fijos que tenía `index.html` (valían para
 * todas las rutas y mandaban todo a la home). La tabla vive en `shared/seo/indexacion.ts`.
 *
 * Va dentro del <BrowserRouter> y del <HelmetProvider>. No dibuja nada en pantalla.
 */
export function SeoDeRuta() {
  const { pathname } = useLocation();
  const decision = decisionSeo(pathname);

  if (decision.tipo === 'la-pagina-decide') return null;

  return (
    <Helmet>
      <meta name="robots" content={decision.robots} />
      {decision.tipo === 'indexar' && <link rel="canonical" href={decision.canonical} />}
    </Helmet>
  );
}
