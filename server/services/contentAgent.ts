import Anthropic from '@anthropic-ai/sdk';
import { BlogPost } from '../models/sql/BlogPost.model.js';
import { Op } from 'sequelize';
import { AppSetting } from '../models/sql/AppSetting.model.js';

/**
 * Content agent: writes blog drafts about the trades people hire on DOAPP.
 *
 * Two constraints shape everything here.
 *
 * 1. Nothing it writes publishes itself. Every post lands as a draft with
 *    generatedBy='agent' and waits for an admin. An agent with publish rights
 *    is a machine that can put the platform's name on a claim nobody read.
 *
 * 2. It writes for answer engines (AEO/GEO), not just for search ranking.
 *    Those systems lift passages and cite them, so the piece has to answer the
 *    question in its first lines, keep each answer self-contained, and carry
 *    explicit question/answer pairs — a post whose meaning depends on the four
 *    paragraphs above it cannot be quoted, and therefore never gets cited.
 */

const MODEL = 'claude-opus-5';

/** Topics grounded in the categories DOAPP actually serves. */
const TOPIC_POOL = [
  { category: 'Reparaciones', angle: 'cuanto cuesta y cuando conviene llamar a un profesional' },
  { category: 'Reparaciones', angle: 'senales de que un arreglo casero se convirtio en un riesgo' },
  { category: 'Limpieza', angle: 'que incluye y que no incluye un servicio, para evitar malentendidos' },
  { category: 'Mantenimiento', angle: 'que revisar por temporada en una casa o departamento' },
  { category: 'Hogar', angle: 'como describir un trabajo para recibir presupuestos comparables' },
  { category: 'Jardín', angle: 'trabajos de estacion y cada cuanto conviene hacerlos' },
  { category: 'Productos Ecológicos', angle: 'alternativas que realmente funcionan y cuales son marketing' },
  { category: 'Tips', angle: 'como evaluar a un profesional antes de contratarlo' },
  { category: 'Tips', angle: 'derechos y obligaciones de cada parte en un trabajo a domicilio' },
  { category: 'Otros', angle: 'oficios regulados en Argentina: cuando exigir matricula' },
] as const;

const SYSTEM_PROMPT = `Escribis para el blog de DOAPP, una plataforma argentina que conecta clientes con trabajadores independientes (plomeros, electricistas, gasistas, personal de limpieza, jardineros, tecnicos).

AUDIENCIA: personas en Argentina que necesitan contratar un trabajo en su casa, y trabajadores independientes que ofrecen esos servicios.

COMO ESCRIBIR PARA MOTORES DE RESPUESTA (esto es lo mas importante):
Los motores de IA levantan pasajes sueltos y los citan. Por eso:
- Responde la pregunta del titulo en las primeras 2 o 3 oraciones, antes de cualquier introduccion.
- Cada seccion tiene que entenderse sola, sin depender de lo anterior. Nada de "como vimos arriba".
- Usa cifras, rangos y plazos concretos en vez de adjetivos. "entre 2 y 4 horas" es citable; "bastante rapido" no.
- Los subtitulos son preguntas reales que la gente escribe o dice.
- Cuando algo depende del caso, deci de que depende, en la misma oracion.

REGLAS DE HONESTIDAD (no negociables):
- Precios: siempre rangos, siempre aclarando que varian por zona y fecha. Nunca un precio unico como si fuera fijo.
- Seguridad: en gas, electricidad y estructura, deci explicitamente que corresponde un profesional matriculado.
- No inventes leyes, numeros de norma, estadisticas ni fuentes. Si no lo sabes con certeza, escribilo en terminos generales.
- No prometas resultados ni tiempos que dependan de terceros.
- DOAPP es intermediaria: no presta los servicios ni garantiza el trabajo. Nunca escribas como si los prestara.
- Al dia de hoy DOAPP verifica identidad, NO verifica matriculas ni seguros. Si mencionas verificacion, decilo asi.

TONO: espanol rioplatense (vos, no tu). Directo y practico. Sin relleno, sin "en el mundo actual", sin exclamaciones.`;

export interface GeneratedPost {
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
  keyTakeaways: string[];
  faq: Array<{ question: string; answer: string }>;
}

/** JSON Schema for the structured response, so nothing needs parsing by hand. */
const POST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subtitle', 'excerpt', 'content', 'metaTitle', 'metaDescription', 'tags', 'keyTakeaways', 'faq'],
  properties: {
    title: { type: 'string', description: 'Titulo. Si la nota responde una pregunta, que el titulo sea esa pregunta.' },
    subtitle: { type: 'string', description: 'Una oracion que amplia el titulo.' },
    excerpt: { type: 'string', description: 'Resumen de 2 oraciones que ya responde la pregunta principal.' },
    content: { type: 'string', description: 'Cuerpo en Markdown, 700 a 1100 palabras, con subtitulos ## que sean preguntas.' },
    metaTitle: { type: 'string', description: 'Maximo 70 caracteres.' },
    metaDescription: { type: 'string', description: 'Maximo 160 caracteres, con la respuesta directa.' },
    tags: { type: 'array', items: { type: 'string' }, description: '3 a 6 etiquetas en minuscula.' },
    keyTakeaways: {
      type: 'array',
      items: { type: 'string' },
      description: '3 a 5 respuestas directas, una oracion cada una, entendibles fuera de contexto.',
    },
    faq: {
      type: 'array',
      description: '3 a 5 pares pregunta/respuesta. Preguntas reales; respuestas de 2 a 4 oraciones autocontenidas.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'answer'],
        properties: { question: { type: 'string' }, answer: { type: 'string' } },
      },
    },
  },
} as const;

export function isContentAgentConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Titles from the last 90 days, so the agent does not rewrite what it just wrote. */
async function recentTitles(): Promise<string[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const posts = await BlogPost.findAll({
    where: { createdAt: { [Op.gte]: since } },
    attributes: ['title'],
    order: [['createdAt', 'DESC']],
    limit: 40,
  });
  return posts.map((p: any) => p.title);
}

function pickTopic(seed: number) {
  return TOPIC_POOL[seed % TOPIC_POOL.length];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

/**
 * Generate one post. Streams because a full article plus FAQ can run long, and
 * a non-streaming request that size risks an HTTP timeout.
 */
export async function generatePost(seed = Date.now()): Promise<GeneratedPost> {
  if (!isContentAgentConfigured()) {
    throw new Error('El agente de contenido no esta configurado (falta ANTHROPIC_API_KEY)');
  }

  const client = new Anthropic();
  const topic = pickTopic(seed);
  const avoid = await recentTitles();

  const userPrompt = [
    `Escribi una nota para la categoria "${topic.category}".`,
    `Enfoque: ${topic.angle}.`,
    '',
    avoid.length
      ? `Ya publicamos estas notas, elegi un angulo distinto y no repitas el titulo:\n${avoid.map((t) => `- ${t}`).join('\n')}`
      : 'Es de las primeras notas del blog.',
  ].join('\n');

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    system: SYSTEM_PROMPT,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: POST_SCHEMA as any },
    } as any,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error(`El modelo declino la solicitud (${(message as any).stop_details?.category ?? 'sin categoria'})`);
  }

  const text = message.content.find((b: any) => b.type === 'text') as any;
  if (!text?.text) throw new Error('El modelo no devolvio contenido');

  const parsed = JSON.parse(text.text) as GeneratedPost;
  return { ...parsed, ...({ category: topic.category } as any) };
}

/**
 * Generate and store a draft awaiting review.
 *
 * Returns the created post. The caller decides how loudly to fail — the cron
 * logs and moves on, the admin endpoint surfaces the error.
 */
export async function generateDraft(seed = Date.now()): Promise<BlogPost> {
  const post = await generatePost(seed);
  const topic = pickTopic(seed);

  let slug = slugify(post.title);
  if (await BlogPost.findOne({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  return BlogPost.create({
    title: post.title,
    subtitle: post.subtitle,
    excerpt: post.excerpt,
    content: post.content,
    slug,
    author: 'DOAPP',
    category: topic.category,
    tags: post.tags,
    metaTitle: post.metaTitle?.slice(0, 70),
    metaDescription: post.metaDescription?.slice(0, 160),
    keyTakeaways: post.keyTakeaways,
    faq: post.faq,
    // Draft + agent authorship is the review gate: the admin list filters on
    // exactly this pair, and publishing is a separate, human action.
    status: 'draft',
    postType: 'official',
    generatedBy: 'agent',
  } as any);
}

// ── On/off switch ────────────────────────────────────────────────────────────


export const CONTENT_AGENT_SETTING_KEY = 'content-agent:enabled';

/**
 * Whether the agent may write.
 *
 * Off unless someone turned it on. A scheduled job that starts spending money
 * and filling a review queue the moment it is deployed is not a good default —
 * especially one whose output carries the platform's name. Enabling it is a
 * deliberate act taken in the admin panel.
 */
export async function isContentAgentEnabled(): Promise<boolean> {
  try {
    const row = await AppSetting.findByPk(CONTENT_AGENT_SETTING_KEY);
    return row?.value?.enabled === true;
  } catch {
    return false; // table not there yet — stay off
  }
}

export async function setContentAgentEnabled(enabled: boolean, updatedBy?: string): Promise<void> {
  await AppSetting.upsert({
    key: CONTENT_AGENT_SETTING_KEY,
    value: { enabled, changedAt: new Date().toISOString() },
    updatedBy,
  } as any);
}
