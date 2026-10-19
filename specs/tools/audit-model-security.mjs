#!/usr/bin/env node
/**
 * Auditoría de seguridad de los modelos.
 *
 * Recorre server/models/sql/*.model.ts y las rutas, y reporta lo que se
 * puede verificar de forma mecánica: secretos que salen por defecto en las
 * consultas, datos personales sin cifrar, asignación masiva desde el body y
 * validaciones ausentes.
 *
 * Es la herramienta de verificación de la especificación 001: cada hallazgo
 * que cierre tiene que desaparecer de esta salida, y la salida se compara
 * contra el umbral aceptado para que no vuelvan a aparecer.
 *
 *   node specs/tools/audit-model-security.mjs            # tabla legible
 *   node specs/tools/audit-model-security.mjs --json     # para CI
 *   node specs/tools/audit-model-security.mjs --severity alta
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = process.cwd();
const MODELS_DIR = join(ROOT, 'server/models/sql');
const ROUTES_DIRS = [join(ROOT, 'server/routes'), join(ROOT, 'server/routes/admin')];

/* ------------------------------------------------------------------ *
 * Clasificación de campos
 *
 * Un campo es sensible por lo que contiene, no por cómo se llama, pero el
 * nombre es la única señal que se puede leer estáticamente. Las listas se
 * revisan cuando aparece un campo nuevo que no encaje.
 * ------------------------------------------------------------------ */

const CLASES = {
  secreto: {
    // Nunca deben salir en una respuesta, ni siquiera al dueño del dato
    patrones: [
      /^password$/i, /secret/i, /^.*token$/i, /verificationcode$/i,
      /^refreshtoken/i, /apikey/i, /privatekey/i, /passwordreset/i,
    ],
    severidad: 'alta',
    regla: 'SEC-01',
  },
  pii_alta: {
    // Identifican a una persona de forma unívoca; filtrarlos habilita fraude
    patrones: [
      /^dni$/i, /^cuit/i, /^cuil/i, /^cbu$/i, /^alias$/i, /dniphoto/i,
      /^selfie/i, /licensenumber/i, /^birthdate$/i, /^bankinginfo$/i,
      /^taxid/i, /passport/i, /^documentnumber/i,
    ],
    severidad: 'alta',
    regla: 'SEC-02',
  },
  pii_media: {
    patrones: [/^phone/i, /^email$/i, /^address$/i, /^ipaddress$/i, /^lastip/i, /geolocation/i],
    severidad: 'media',
    regla: 'SEC-03',
  },
};

function clasificar(campo) {
  for (const [clase, def] of Object.entries(CLASES)) {
    if (def.patrones.some(p => p.test(campo))) return { clase, ...def };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Lectura de modelos
 * ------------------------------------------------------------------ */

/** Campos declarados: `nombre!: tipo;` o `nombre?: tipo;` tras un @Column */
function extraerCampos(src) {
  const campos = [];
  const re = /@Column\([\s\S]{0,400}?\)\s*\n\s*(?:declare\s+)?(\w+)[!?]?\s*:/g;
  let m;
  while ((m = re.exec(src))) {
    const nombre = m[1];
    const bloque = m[0];
    campos.push({
      nombre,
      cifrado: /get\(\)|set\(/.test(bloque) && /encrypt|decrypt/i.test(bloque),
      tieneValidacion: /validate\s*:/.test(bloque),
      allowNullExplicito: /allowNull\s*:/.test(bloque),
    });
  }
  return campos;
}

function protecciones(src) {
  return {
    defaultScope: /defaultScope\s*:/.test(src),
    scopes: /\bscopes\s*:/.test(src),
    toJSON: /\btoJSON\s*\(/.test(src),
    usaCifrado: /encrypt|decrypt/i.test(src),
    // @AllowNull(false) del decorador de sequelize-typescript
    allowNullDecorador: (src.match(/@AllowNull\(false\)/g) || []).length,
  };
}

function auditarModelo(archivo) {
  const src = readFileSync(archivo, 'utf8');
  const nombre = basename(archivo).replace('.model.ts', '');
  const campos = extraerCampos(src);
  const prot = protecciones(src);
  const hallazgos = [];

  const sensibles = campos
    .map(c => ({ ...c, cls: clasificar(c.nombre) }))
    .filter(c => c.cls);

  const secretos = sensibles.filter(c => c.cls.clase === 'secreto');
  const piiAlta = sensibles.filter(c => c.cls.clase === 'pii_alta');

  // SEC-01 — un secreto sale en cualquier consulta que no liste attributes
  if (secretos.length > 0 && !prot.defaultScope && !prot.toJSON) {
    hallazgos.push({
      regla: 'SEC-01',
      severidad: 'alta',
      modelo: nombre,
      campos: secretos.map(c => c.nombre),
      detalle:
        'El modelo guarda secretos y no define defaultScope ni toJSON que los excluya: ' +
        'cualquier consulta sin attributes explícitos los devuelve.',
    });
  }

  // SEC-02 — dato personal fuerte guardado en claro
  const piiEnClaro = piiAlta.filter(c => !c.cifrado);
  if (piiEnClaro.length > 0 && !prot.usaCifrado) {
    hallazgos.push({
      regla: 'SEC-02',
      severidad: 'alta',
      modelo: nombre,
      campos: piiEnClaro.map(c => c.nombre),
      detalle: 'Datos personales de identificación guardados sin cifrar en la base.',
    });
  } else if (piiEnClaro.length > 0) {
    hallazgos.push({
      regla: 'SEC-02',
      severidad: 'media',
      modelo: nombre,
      campos: piiEnClaro.map(c => c.nombre),
      detalle: 'El modelo cifra algunos campos pero estos quedaron en claro.',
    });
  }

  // SEC-04 — sin ninguna restricción de obligatoriedad declarada
  if (campos.length > 5 && prot.allowNullDecorador === 0 && !campos.some(c => c.allowNullExplicito)) {
    hallazgos.push({
      regla: 'SEC-04',
      severidad: 'baja',
      modelo: nombre,
      campos: [],
      detalle: `${campos.length} campos y ninguno declara obligatoriedad: la base acepta filas incompletas.`,
    });
  }

  return {
    modelo: nombre,
    totalCampos: campos.length,
    sensibles: sensibles.length,
    secretos: secretos.length,
    piiAlta: piiAlta.length,
    protecciones: prot,
    hallazgos,
  };
}

/* ------------------------------------------------------------------ *
 * Asignación masiva en rutas
 * ------------------------------------------------------------------ */

function auditarRutas() {
  const hallazgos = [];
  for (const dir of ROUTES_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.ts'))) {
      const ruta = join(dir, f);
      const src = readFileSync(ruta, 'utf8');
      const lineas = src.split('\n');
      lineas.forEach((linea, i) => {
        // create(req.body) / update(req.body) / { ...req.body }
        const masivo =
          /\.(create|update|bulkCreate)\(\s*req\.body\s*[,)]/.test(linea) ||
          /\{\s*\.\.\.req\.body\s*\}/.test(linea);
        if (masivo) {
          hallazgos.push({
            regla: 'SEC-05',
            severidad: 'alta',
            archivo: `server/routes/${dir.endsWith('admin') ? 'admin/' : ''}${f}`,
            linea: i + 1,
            detalle: 'El body entra entero al modelo: permite escribir campos no previstos.',
            codigo: linea.trim().slice(0, 100),
          });
        }
      });
    }
  }
  return hallazgos;
}

/* ------------------------------------------------------------------ *
 * Salida
 * ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const json = args.includes('--json');
const filtroSeveridad = args.includes('--severity')
  ? args[args.indexOf('--severity') + 1]
  : null;

const modelos = readdirSync(MODELS_DIR)
  .filter(f => f.endsWith('.model.ts'))
  .map(f => auditarModelo(join(MODELS_DIR, f)));

let hallazgos = [...modelos.flatMap(m => m.hallazgos), ...auditarRutas()];
if (filtroSeveridad) hallazgos = hallazgos.filter(h => h.severidad === filtroSeveridad);

const porSeveridad = { alta: 0, media: 0, baja: 0 };
for (const h of hallazgos) porSeveridad[h.severidad]++;

const resumen = {
  fecha: new Date().toISOString(),
  modelosAuditados: modelos.length,
  camposSensibles: modelos.reduce((s, m) => s + m.sensibles, 0),
  porSeveridad,
  hallazgos,
};

if (json) {
  console.log(JSON.stringify(resumen, null, 2));
} else {
  console.log(`\nAuditoría de seguridad de modelos — ${modelos.length} modelos\n`);
  console.log(`  alta: ${porSeveridad.alta}   media: ${porSeveridad.media}   baja: ${porSeveridad.baja}\n`);
  for (const sev of ['alta', 'media', 'baja']) {
    const grupo = hallazgos.filter(h => h.severidad === sev);
    if (!grupo.length) continue;
    console.log(`── severidad ${sev} ──`);
    for (const h of grupo) {
      const donde = h.modelo || `${h.archivo}:${h.linea}`;
      console.log(`  [${h.regla}] ${donde}`);
      console.log(`     ${h.detalle}`);
      if (h.campos?.length) console.log(`     campos: ${h.campos.join(', ')}`);
      if (h.codigo) console.log(`     ${h.codigo}`);
    }
    console.log('');
  }
}

// En CI: falla si hay hallazgos de severidad alta
process.exit(porSeveridad.alta > 0 && args.includes('--ci') ? 1 : 0);
