# Desarrollo guiado por especificación

El código sale de una especificación, no al revés. Este directorio tiene el
método, las plantillas y las especificaciones vivas.

```
specs/
  CONSTITUTION.md          reglas que rigen todo cambio
  templates/               plantillas de cada etapa
  NNN-nombre/              una carpeta por unidad de trabajo
    spec.md                qué problema y qué resultado se espera
    clarify.md             lo que hay que decidir antes de planificar
    plan.md                cómo se va a hacer
    tasks.md               en qué pasos, con su verificación
  tools/                   verificadores que corren solos
```

## Las cinco etapas

| Etapa | Comando | Sale de acá | Quién decide |
|---|---|---|---|
| 1. Especificar | `/specify` | `spec.md` — el qué y el porqué, sin solución | Claude propone |
| 2. Clarificar | `/clarify` | `clarify.md` — preguntas con opciones | **Vos respondés** |
| 3. Planificar | `/plan` | `plan.md` — enfoque, riesgos, orden | **Vos confirmás** |
| 4. Tareas | `/tasks` | `tasks.md` — pasos verificables | Claude propone |
| 5. Implementar | `/implement` | código + verificación corrida | **Vos confirmás al cerrar** |

Las tres marcadas en negrita son puertas: el trabajo se detiene ahí hasta
que respondas. Está en la Constitución, artículo II.

## Reglas del método

**La especificación no contiene la solución.** Dice qué tiene que pasar y
cómo se sabrá que pasó. Si menciona un nombre de archivo o una librería,
está describiendo la solución antes de tiempo.

**Toda afirmación de la especificación es verificable.** "Mejorar la
seguridad" no es un criterio. "Ninguna consulta a `users` devuelve
`password` sin pedirlo explícitamente, comprobado por el auditor" sí.

**Las clarificaciones vienen con opciones y con una recomendación.** Una
pregunta abierta te hace trabajar a vos; una pregunta con tres opciones y
un consejo fundado te hace decidir.

**Lo que no se puede verificar, no se declara hecho.** Si el entorno impide
correr algo, se dice qué quedó sin verificar y por qué.

## Estado

| Spec | Tema | Etapa | Confirmada |
|---|---|---|---|
| [001](001-seguridad-modelos/spec.md) | Seguridad de los modelos de datos | Clarificación | ⏳ esperando respuestas |

## Verificadores

```bash
node specs/tools/audit-model-security.mjs          # tabla legible
node specs/tools/audit-model-security.mjs --json   # para procesar
node specs/tools/audit-model-security.mjs --ci     # falla si hay severidad alta
```
