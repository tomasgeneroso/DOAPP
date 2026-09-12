import { Fragment, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation, Trans } from 'react-i18next';
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Home, FileText } from "lucide-react";
import {
  TERMS_BODY,
  TERMS_COMMISSION_AFTER,
  TERMS_COMMISSION_HEADERS,
  TERMS_COMMISSION_ROWS,
  type TermsBlock,
} from "../../../shared/legal/terms.structure";
import { termsEs } from "../../../shared/legal/terms.es";

/**
 * Términos y Condiciones.
 *
 * El cuerpo se dibuja recorriendo TERMS_BODY, igual que en mobile. Antes era
 * JSX escrito a mano, clausula por clausula, y se quedo atras: las clausulas
 * 9.4 y 10.5 a 10.10 (escalera de cancelaciones, silencio en disputas, plazo
 * para reclamar, contracargos) existian en el texto compartido y en mobile pero
 * en la web no aparecian. Un documento legal que se muestra distinto segun el
 * dispositivo no es un documento.
 *
 * Los textos llegan por i18n (namespace `termsPage`, que client/i18n/index.ts
 * arma desde shared/legal/terms.*.ts); el fallback es el español compartido,
 * asi que nunca hay una copia a mano en este archivo.
 */

const P_CLASS = "text-slate-600 dark:text-slate-300 mb-3 scroll-mt-24";

function Clause({ k }: { k: string }) {
  return (
    <p id={k} className={P_CLASS}>
      <Trans i18nKey={`termsPage.${k}`} components={{ b: <strong /> }} defaults={termsEs[k]} />
    </p>
  );
}

function CommissionTable() {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <thead className="bg-slate-100 dark:bg-slate-700">
          <tr>
            {TERMS_COMMISSION_HEADERS.map((h) => (
              <th key={h} className="px-4 py-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t(`termsPage.${h}`, termsEs[h])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TERMS_COMMISSION_ROWS.map((r, i) => (
            <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
              <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
                {r.planKey ? t(`termsPage.${r.planKey}`, termsEs[r.planKey]) : r.plan}
              </td>
              <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">{r.commission}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Agrupa los bloques en secciones (un titulo abre una) y, dentro de cada una,
 * junta los items de lista consecutivos en un solo <ul>.
 */
function renderBody(t: (k: string, d: string) => string): ReactNode[] {
  const out: ReactNode[] = [];
  let seccion: ReactNode[] | null = null;
  let lista: string[] = [];

  const cerrarLista = (destino: ReactNode[]) => {
    if (lista.length === 0) return;
    destino.push(
      <ul key={`ul-${lista[0]}`} className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
        {lista.map((k) => (
          <li key={k}>
            <Trans i18nKey={`termsPage.${k}`} components={{ b: <strong /> }} defaults={termsEs[k]} />
          </li>
        ))}
      </ul>,
    );
    lista = [];
  };

  const cerrarSeccion = () => {
    if (!seccion) return;
    cerrarLista(seccion);
    out.push(<section key={`sec-${out.length}`} className="mb-8">{seccion}</section>);
    seccion = null;
  };

  const emitir = (nodo: ReactNode) => {
    if (seccion) seccion.push(nodo);
    else out.push(nodo);
  };

  for (const bloque of TERMS_BODY as TermsBlock[]) {
    const { key, kind } = bloque;

    if (kind === 'title') {
      cerrarSeccion();
      seccion = [
        <h2 key={key} className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
          {t(`termsPage.${key}`, termsEs[key])}
        </h2>,
      ];
      continue;
    }

    if (kind === 'listItem') {
      lista.push(key);
      continue;
    }

    // Cualquier otra cosa corta la lista en curso.
    cerrarLista(seccion ?? out);

    if (key === 'importantNote') {
      cerrarSeccion();
      out.push(
        <div key={key} className="mt-12 p-6 bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500 rounded-r-lg">
          <p className="text-sm text-sky-900 dark:text-sky-100">
            <Trans i18nKey={`termsPage.${key}`} components={{ b: <strong /> }} defaults={termsEs[key]} />
          </p>
        </div>,
      );
      continue;
    }

    if (kind === 'note') {
      emitir(
        <div key={key} className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-r-lg mb-4">
          <p className="text-amber-800 dark:text-amber-200 text-sm">
            <Trans i18nKey={`termsPage.${key}`} components={{ b: <strong /> }} defaults={termsEs[key]} />
          </p>
        </div>,
      );
      continue;
    }

    emitir(
      <Fragment key={key}>
        <Clause k={key} />
        {key === TERMS_COMMISSION_AFTER && <CommissionTable />}
      </Fragment>,
    );
  }

  cerrarSeccion();
  return out;
}

export default function TermsAndConditions() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t('termsPage.metaTitle', termsEs.metaTitle)}</title>
        <meta name="description" content={t('termsPage.metaDescription', termsEs.metaDescription)} />
      </Helmet>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Navegación */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('termsPage.back', termsEs.back)}
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Home className="h-4 w-4" />
              {t('termsPage.home', termsEs.home)}
            </Link>
          </div>

          {/* Contenido */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 md:p-12">
            <div className="flex items-center gap-3 mb-6">
              <FileText className="h-8 w-8 text-sky-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                {t('termsPage.title', termsEs.title)}
              </h1>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
              {t('termsPage.lastUpdated', termsEs.lastUpdated)}
            </p>

            <div className="prose prose-slate dark:prose-invert max-w-none">
              {renderBody(t)}
            </div>
          </div>

          {/* Footer con enlace */}
          <div className="mt-8 text-center">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 transition-colors"
            >
              {t('termsPage.acceptAndBack', 'Acepto los términos, volver')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
