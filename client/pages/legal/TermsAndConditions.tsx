import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Home, FileText } from "lucide-react";

export default function TermsAndConditions() {
  return (
    <>
      <Helmet>
        <title>Términos y Condiciones - DOAPP</title>
        <meta
          name="description"
          content="Términos y condiciones generales de uso de la plataforma DOAPP"
        />
      </Helmet>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Navegación */}
          <div className="flex items-center justify-between mb-8">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Home className="h-4 w-4" />
              Inicio
            </Link>
          </div>

          {/* Contenido */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 md:p-12">
            <div className="flex items-center gap-3 mb-6">
              <FileText className="h-8 w-8 text-sky-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                Términos y Condiciones Generales de Uso
              </h1>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
              Última actualización: 17 de Marzo de 2026
            </p>

            <div className="prose prose-slate dark:prose-invert max-w-none">
              <p className="text-slate-600 dark:text-slate-300 mb-6">
                Los presentes Términos y Condiciones (en adelante, los "Términos") regulan el acceso y uso de la plataforma digital denominada DOAPP (en adelante, la "Plataforma"), por parte de cualquier persona humana o jurídica que se registre y/o utilice sus servicios (en adelante, el "Usuario").
              </p>
              <p className="text-slate-600 dark:text-slate-300 mb-8">
                La utilización de la Plataforma implica la aceptación plena y sin reservas de los presentes Términos, los cuales constituyen un contrato válido y vinculante conforme a los artículos 958 y concordantes del Código Civil y Comercial de la Nación.
              </p>

              {/* 1. Identificación */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  1. Identificación del Titular de la Plataforma
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  La Plataforma es operada por DOAPP, con domicilio legal en la República Argentina (en adelante, "DOAPP").
                </p>
              </section>

              {/* 2. Descripción del servicio */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  2. Descripción del Servicio
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  DOAPP es una plataforma digital de intermediación tecnológica, bajo el modelo de marketplace y red social, que permite vincular:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li><strong>Clientes:</strong> personas humanas o jurídicas que demandan servicios.</li>
                  <li><strong>Trabajadores / Doers:</strong> personas humanas que ofrecen servicios profesionales u oficios de manera independiente.</li>
                </ul>
                <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-r-lg">
                  <p className="text-amber-800 dark:text-amber-200 text-sm">
                    DOAPP NO presta los servicios publicados, NO es empleador, NO actúa como parte del contrato de prestación de servicios, limitándose su rol a facilitar herramientas tecnológicas de contacto, gestión de pagos, custodia de fondos y mediación en disputas.
                  </p>
                </div>
              </section>

              {/* 3. Naturaleza jurídica */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  3. Naturaleza Jurídica de la Relación
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  3.1. Los Trabajadores se registran y actúan como prestadores independientes y autónomos, sin que exista relación laboral, societaria, de dependencia, mandato, agencia o franquicia con DOAPP.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  3.2. Cada contrato celebrado a través de la Plataforma se perfecciona exclusivamente entre Cliente y Trabajador, quienes asumen íntegramente los derechos y obligaciones emergentes del mismo.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  3.3. DOAPP no ejerce control técnico, disciplinario ni organizativo sobre los Trabajadores, limitándose a reglas de uso de la Plataforma.
                </p>
              </section>

              {/* 4. Registro */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  4. Registro de Usuarios
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  4.1. El acceso a la Plataforma requiere registro previo y creación de una cuenta personal.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  4.2. El Usuario garantiza la veracidad, exactitud y actualización de los datos suministrados.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  4.3. DOAPP podrá requerir procesos de verificación de identidad (KYC), incluyendo validación de correo electrónico, teléfono, documento de identidad y datos fiscales, especialmente para membresías PRO y SUPER PRO.
                </p>
              </section>

              {/* 5. Categorías */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  5. Categorías de Servicios
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  La Plataforma permite la publicación y contratación de servicios, entre otros:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-1">
                  <li>Limpieza</li>
                  <li>Mudanzas</li>
                  <li>Jardinería</li>
                  <li>Construcción</li>
                  <li>Tecnología</li>
                  <li>Servicios profesionales varios</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300">
                  DOAPP no garantiza la idoneidad, calidad, resultado ni legalidad de los servicios ofrecidos.
                </p>
              </section>

              {/* 6. Sistema de contratación */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  6. Sistema de Contratación
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  6.1. El ciclo de contratación incluye: publicación, postulación, aceptación, pago, ejecución, confirmación por parte de un administrador de la plataforma y completado.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  6.2. La aceptación del Trabajador y del Cliente genera un contrato digital vinculante entre ambos.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  6.3. El sistema requiere confirmación bilateral de finalización para la liberación de fondos.
                </p>
              </section>

              {/* 7. Pagos */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  7. Pagos, Comisiones y Escrow
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  7.1. Los pagos se procesan a través de MercadoPago, aceptándose los medios habilitados por dicho proveedor.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  7.2. DOAPP actúa como custodio de fondos (escrow), reteniendo el dinero hasta la confirmación del servicio.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  7.3. DOAPP percibe una comisión por el uso de la Plataforma, conforme al plan del Usuario:
                </p>
                <div className="overflow-x-auto mb-4">
                  <table className="min-w-full border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 dark:bg-slate-700">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Plan</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">Comisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">FREE</td>
                        <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">8%</td>
                      </tr>
                      <tr className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">PRO ($4.999/mes)</td>
                        <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">3%</td>
                      </tr>
                      <tr className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">SUPER PRO ($8.999/mes)</td>
                        <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">1%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  7.4. Comisión mínima: para contratos inferiores a $8.000 ARS se aplicará una comisión fija de $1.000 ARS.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  7.5. La comisión de DOAPP no es reembolsable, incluso en casos de cancelación o disputa.
                </p>
              </section>

              {/* 8. Membresías */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  8. Membresías y Suscripciones
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  8.1. DOAPP ofrece planes FREE, PRO y SUPER PRO, con renovación automática mensual.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  8.2. La cancelación no genera reintegro y los beneficios subsisten hasta el vencimiento del período abonado.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  8.3. DOAPP podrá modificar precios, notificando previamente al Usuario.
                </p>
              </section>

              {/* 9. Cancelaciones */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  9. Cancelaciones
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  9.1. Cancelaciones previas a la aceptación por parte de un Administrador de la plataforma: devolución total.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  9.2. Cancelaciones hasta 24 horas antes del inicio: devolución del monto menos comisión, siempre y cuando la publicación no haya sido aceptada por un administrador de la plataforma.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  9.3. Cancelaciones tardías o durante la ejecución: distribución proporcional conforme lo establecido en la Plataforma, con retención de comisiones.
                </p>
              </section>

              {/* 10. Disputas */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  10. Disputas y Mediación
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  10.1. DOAPP actúa como mediador interno, sin carácter jurisdiccional.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  10.2. La apertura de una disputa congela los fondos hasta su resolución.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  10.3. Las decisiones del Administrador podrán consistir en liberación total, reembolso total, parcial o cierre sin acción. Para la toma de la resolución definitiva, se utilizará la información que voluntariamente remitieron las partes sobre las condiciones de contratación.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  10.4. La comisión de la Plataforma no se devuelve en ningún supuesto.
                </p>
              </section>

              {/* 11. Responsabilidad */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  11. Responsabilidad
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  11.1. DOAPP no responde por:
                </p>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 mb-4 space-y-2">
                  <li>La calidad, ejecución o resultado de los servicios.</li>
                  <li>Daños personales, materiales o patrimoniales derivados de la prestación.</li>
                </ul>
                <p className="text-slate-600 dark:text-slate-300">
                  11.2. El Usuario exonera a DOAPP de cualquier reclamo derivado de su relación contractual con otros Usuarios.
                </p>
              </section>

              {/* 12. Impuestos */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  12. Impuestos y Facturación
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  12.1. Los Trabajadores son responsables de emitir las facturas correspondientes y cumplir con sus obligaciones fiscales ante AFIP.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  12.2. DOAPP podrá emitir factura por el cobro de sus comisiones.
                </p>
              </section>

              {/* 13. Datos personales */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  13. Protección de Datos Personales
                </h2>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  13.1. DOAPP cumple con la Ley 25.326 de Protección de Datos Personales.
                </p>
                <p className="text-slate-600 dark:text-slate-300 mb-3">
                  13.2. Los datos bancarios y de identidad se almacenan de forma encriptada.
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  13.3. El Usuario podrá ejercer los derechos de acceso, rectificación, supresión y oposición.
                </p>
              </section>

              {/* 14. Publicidad */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  14. Publicidad
                </h2>
                <p className="text-slate-600 dark:text-slate-300">
                  DOAPP podrá ofrecer espacios publicitarios sujetos a disponibilidad, aprobación previa y pago anticipado.
                </p>
              </section>

              {/* 15. Sanciones */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  15. Sanciones
                </h2>
                <p className="text-slate-600 dark:text-slate-300">
                  DOAPP podrá aplicar advertencias, suspensiones o cancelación definitiva de cuentas ante incumplimientos, fraude o uso indebido de la Plataforma.
                </p>
              </section>

              {/* 16. Modificaciones */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  16. Modificaciones
                </h2>
                <p className="text-slate-600 dark:text-slate-300">
                  DOAPP podrá modificar estos Términos, los cuales entrarán en vigencia desde su publicación.
                </p>
              </section>

              {/* 17. Ley aplicable */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  17. Ley Aplicable y Jurisdicción
                </h2>
                <p className="text-slate-600 dark:text-slate-300">
                  Los presentes Términos se rigen por las leyes de la República Argentina. Para los consumidores, será competente el tribunal del domicilio del Usuario conforme Ley 24.240.
                </p>
              </section>

              {/* 18. Aceptación */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">
                  18. Aceptación
                </h2>
                <p className="text-slate-600 dark:text-slate-300">
                  El Usuario declara haber leído, comprendido y aceptado íntegramente los presentes Términos y Condiciones.
                </p>
              </section>

              <div className="mt-12 p-6 bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500 rounded-r-lg">
                <p className="text-sm text-sky-900 dark:text-sky-100">
                  <strong>Nota importante:</strong> Al registrarte y utilizar DOAPP, confirmas que has leído,
                  entendido y aceptado estos Términos y Condiciones en su totalidad.
                </p>
              </div>
            </div>
          </div>

          {/* Footer con enlace */}
          <div className="mt-8 text-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 transition-colors"
            >
              Acepto los términos, continuar con el registro
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
