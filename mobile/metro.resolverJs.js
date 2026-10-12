/**
 * Los archivos de `shared/` los usan el servidor (ESM de Node) y la app. Node exige la extensión en los imports
 * relativos ('../constants/membershipPricing.js') aunque el archivo real sea `.ts`; Metro busca el `.js` al pie de la
 * letra y no lo encuentra, así que la app NO COMPILABA (la pantalla de términos importa `shared/legal/terms.structure`,
 * que importa `membershipPricing.js`).
 *
 * Si un import relativo con `.js` no existe, se prueba sin la extensión para que Metro encuentre el `.ts`/`.tsx`. Si el
 * `.js` existe de verdad, se usa ese. Los paquetes (no relativos) no se tocan.
 */
function resolvedorConExtensionJs(resolverPorDefecto) {
  return (context, moduleName, platform) => {
    const resolver = resolverPorDefecto || context.resolveRequest;
    if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
      try {
        return resolver(context, moduleName, platform);
      } catch (error) {
        return resolver(context, moduleName.slice(0, -3), platform);
      }
    }
    return resolver(context, moduleName, platform);
  };
}

module.exports = { resolvedorConExtensionJs };
