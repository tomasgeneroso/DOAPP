import mongoose from "mongoose";
import BlogPost from "../models/BlogPost.js";
import User from "../models/User.js";
import { config } from "../config/env.js";
import connectDB from "../config/database.js";

const blogPosts = [
  {
    title: "Cómo Reparar una Canilla que Gotea: Guía Paso a Paso",
    subtitle: "Ahorra agua y dinero aprendiendo a reparar una canilla que gotea en solo 30 minutos",
    content: `
<h2>Introducción</h2>
<p>Una canilla que gotea puede desperdiciar hasta 15 litros de agua al día. Además del desperdicio, genera ruido molesto y aumenta tu factura de agua. La buena noticia es que reparar una canilla es una tarea sencilla que puedes hacer tú mismo sin necesidad de llamar a un plomero.</p>

<h2>Herramientas Necesarias</h2>
<ul>
<li>Llave inglesa o llave francesa</li>
<li>Destornillador (plano y phillips)</li>
<li>Trapo o toalla</li>
<li>Kit de reparación de canillas (disponible en ferreterías)</li>
<li>Vaselina o grasa siliconada</li>
</ul>

<h2>Paso 1: Cerrar el Suministro de Agua</h2>
<p>Antes de comenzar, es fundamental cerrar la llave de paso del agua. Generalmente se encuentra debajo del lavabo o en el tanque principal. Abre la canilla después de cerrar la llave para liberar la presión del agua restante.</p>

<h2>Paso 2: Desmontar la Canilla</h2>
<p>Retira la tapa decorativa de la canilla (generalmente se puede quitar con cuidado usando un destornillador). Verás un tornillo que mantiene la manija en su lugar. Quítalo y retira la manija.</p>

<h2>Paso 3: Retirar el Vástago</h2>
<p>Con la llave inglesa, afloja y retira el vástago de la canilla girándolo en sentido antihorario. Ten cuidado de no dañar las roscas.</p>

<h2>Paso 4: Reemplazar la Arandela</h2>
<p>En la base del vástago encontrarás una arandela de goma. Esta es usualmente la causante del goteo. Retira la arandela vieja y reemplázala con una nueva del mismo tamaño. Asegúrate de que esté bien ajustada.</p>

<h2>Paso 5: Revisar el Asiento de la Válvula</h2>
<p>Inspecciona el asiento de la válvula (donde se asienta la arandela) en busca de daños o desgaste. Si está deteriorado, puede causar goteos incluso con una arandela nueva. En este caso, necesitarás reemplazar el cartucho completo o llamar a un profesional.</p>

<h2>Paso 6: Rearmar la Canilla</h2>
<p>Aplica una pequeña cantidad de vaselina o grasa siliconada en las roscas del vástago para facilitar futuras reparaciones. Vuelve a colocar todas las piezas en orden inverso:</p>
<ol>
<li>Inserta el vástago y ajústalo con la llave inglesa (sin apretar demasiado)</li>
<li>Coloca la manija y asegúrala con el tornillo</li>
<li>Vuelve a colocar la tapa decorativa</li>
</ol>

<h2>Paso 7: Probar la Reparación</h2>
<p>Abre lentamente la llave de paso y verifica que no haya fugas. Abre y cierra la canilla varias veces para asegurarte de que funcione correctamente.</p>

<h2>Consejos Adicionales</h2>
<ul>
<li><strong>Prevención:</strong> No cierres las canillas con demasiada fuerza, esto desgasta las arandelas más rápido</li>
<li><strong>Mantenimiento:</strong> Revisa las canillas cada 6 meses y reemplaza las arandelas si están endurecidas</li>
<li><strong>Ahorro:</strong> Reparar una canilla que gotea puede ahorrarte hasta $500 anuales en agua</li>
</ul>

<h2>Cuándo Llamar a un Profesional</h2>
<p>Si después de reemplazar la arandela el goteo persiste, o si notas fugas en la base de la canilla, es momento de llamar a un plomero. También consulta a un profesional si:</p>
<ul>
<li>El asiento de la válvula está muy dañado</li>
<li>La canilla es muy antigua y las piezas no están disponibles</li>
<li>Hay fugas en las paredes o debajo del lavabo</li>
</ul>

<h2>Conclusión</h2>
<p>Reparar una canilla que gotea es una tarea sencilla que puede ahorrarte dinero y ayudar al medio ambiente. Con las herramientas correctas y un poco de paciencia, puedes resolver este problema en menos de una hora. ¡Manos a la obra!</p>
    `,
    excerpt: "Aprende a reparar una canilla que gotea con esta guía paso a paso. Ahorra agua, dinero y evita llamar al plomero con herramientas básicas que probablemente ya tienes en casa.",
    author: "Carlos Méndez",
    tags: ["reparaciones", "plomería", "ahorro", "mantenimiento", "hogar"],
    category: "Reparaciones",
    status: "published",
  },
  {
    title: "Guía Completa: Cómo Limpiar Correctamente el Baño",
    subtitle: "Técnicas profesionales para mantener tu baño impecable y libre de gérmenes",
    content: `
<h2>Introducción</h2>
<p>El baño es uno de los espacios más importantes de la casa y requiere una limpieza regular y profunda. Un baño limpio no solo se ve bien, sino que también previene la acumulación de bacterias, hongos y malos olores. En esta guía aprenderás las técnicas profesionales para limpiar cada parte del baño de manera eficiente.</p>

<h2>Materiales y Productos Necesarios</h2>
<ul>
<li>Guantes de goma</li>
<li>Paños de microfibra (varios)</li>
<li>Cepillo para inodoro</li>
<li>Cepillo de dientes viejo (para rincones)</li>
<li>Esponja no abrasiva</li>
<li>Limpiador multiusos</li>
<li>Limpiador desinfectante para baño</li>
<li>Limpiador de vidrios</li>
<li>Bicarbonato de sodio</li>
<li>Vinagre blanco</li>
<li>Balde</li>
</ul>

<h2>Paso 1: Preparación</h2>
<p>Antes de comenzar, retira todos los elementos del baño: alfombras, cortinas de ducha, cestos de basura, y productos de higiene personal. Esto te permitirá limpiar todas las superficies sin obstáculos.</p>

<h2>Paso 2: Ventilar el Baño</h2>
<p>Abre ventanas o enciende el extractor. La ventilación es crucial cuando usas productos de limpieza, especialmente desinfectantes.</p>

<h2>Paso 3: Limpieza del Inodoro</h2>
<ol>
<li><strong>Interior:</strong> Aplica limpiador para inodoro en el borde y deja actuar 10 minutos. Usa el cepillo para fregar toda la superficie interior, especialmente debajo del borde.</li>
<li><strong>Exterior:</strong> Rocía desinfectante en la tapa, asiento, y base. Limpia con un paño de microfibra, prestando especial atención a las bisagras y base.</li>
<li><strong>Truco profesional:</strong> Para manchas difíciles, mezcla bicarbonato con vinagre y deja actuar 30 minutos antes de fregar.</li>
</ol>

<h2>Paso 4: Limpieza de la Ducha/Bañera</h2>
<h3>Azulejos y Paredes</h3>
<p>Rocía limpiador multiusos en todas las superficies y deja actuar 5 minutos. Friega con una esponja desde arriba hacia abajo. Para las juntas, usa un cepillo de dientes con una mezcla de bicarbonato y agua.</p>

<h3>Mampara o Cortina</h3>
<ul>
<li><strong>Mampara de vidrio:</strong> Limpia con limpiador de vidrios o una mezcla de vinagre y agua (1:1). Seca con un paño para evitar marcas de agua.</li>
<li><strong>Cortina de baño:</strong> Lávala en la lavadora con detergente y una toalla (la toalla ayuda a limpiar mejor). Agrega media taza de bicarbonato al ciclo.</li>
</ul>

<h3>Grifería</h3>
<p>Limpia con vinagre para eliminar manchas de agua dura. Para el sarro acumulado, empapa un paño en vinagre y envuelve la grifería por 30 minutos.</p>

<h2>Paso 5: Limpieza del Lavabo</h2>
<ol>
<li>Retira todos los productos del área</li>
<li>Rocía limpiador en el lavabo, incluyendo la grifería</li>
<li>Friega con una esponja, prestando atención al desagüe</li>
<li>Limpia el espejo con limpiador de vidrios</li>
<li>Seca todas las superficies con un paño limpio</li>
</ol>

<h2>Paso 6: Limpieza del Piso</h2>
<ol>
<li>Barre o aspira para eliminar polvo y cabellos</li>
<li>Trapea con agua y limpiador multiusos</li>
<li>Presta especial atención a los rincones y alrededor del inodoro</li>
<li>Deja secar completamente antes de volver a colocar las alfombras</li>
</ol>

<h2>Paso 7: Toques Finales</h2>
<ul>
<li>Limpia las manijas de puertas y interruptores con desinfectante</li>
<li>Lava los cestos de basura</li>
<li>Reemplaza las toallas con unas limpias</li>
<li>Rocía un poco de ambientador natural (opcional)</li>
</ul>

<h2>Limpieza Profunda Mensual</h2>
<p>Una vez al mes, realiza estas tareas adicionales:</p>
<ul>
<li>Limpia los extractores de aire</li>
<li>Lava las alfombras y tapetes del baño</li>
<li>Desinfecta los accesorios (jaboneras, soportes de cepillos)</li>
<li>Revisa y limpia las juntas de silicona</li>
</ul>

<h2>Consejos de Mantenimiento</h2>
<ul>
<li><strong>Diario:</strong> Limpia salpicaduras inmediatamente y seca superficies húmedas</li>
<li><strong>Semanal:</strong> Desinfecta el inodoro y limpia el espejo</li>
<li><strong>Quincenal:</strong> Limpieza profunda completa</li>
</ul>

<h2>Prevención de Moho y Hongos</h2>
<p>El moho prospera en ambientes húmedos. Para prevenirlo:</p>
<ul>
<li>Ventila el baño después de cada uso</li>
<li>Seca las paredes de la ducha con un jalador de goma</li>
<li>Mantén las cortinas de baño extendidas para que se sequen</li>
<li>Usa un deshumidificador si es necesario</li>
</ul>

<h2>Soluciones Naturales</h2>
<p>Para quienes prefieren opciones ecológicas:</p>
<ul>
<li><strong>Limpiador multiusos:</strong> 1 parte vinagre + 1 parte agua + unas gotas de aceite esencial</li>
<li><strong>Desincrustante:</strong> Pasta de bicarbonato y agua</li>
<li><strong>Desinfectante:</strong> Vinagre blanco puro</li>
</ul>

<h2>Conclusión</h2>
<p>Un baño limpio es esencial para la salud y el bienestar de tu familia. Siguiendo esta rutina de limpieza, mantendrás tu baño impecable con el mínimo esfuerzo. Recuerda que la clave es la constancia: es más fácil mantener limpio que limpiar después de mucho tiempo.</p>
    `,
    excerpt: "Aprende las técnicas profesionales para limpiar tu baño de arriba a abajo. Incluye trucos, productos recomendados y soluciones para manchas difíciles.",
    author: "María González",
    tags: ["limpieza", "baño", "desinfección", "mantenimiento", "hogar"],
    category: "Limpieza",
    status: "published",
  },
  {
    title: "Productos de Limpieza Ecológicos Caseros: Recetas Efectivas y Económicas",
    subtitle: "Crea tus propios productos de limpieza naturales, seguros para tu familia y el planeta",
    content: `
<h2>Introducción</h2>
<p>Los productos de limpieza comerciales contienen químicos que pueden ser nocivos para la salud y el medio ambiente. Crear tus propios productos de limpieza ecológicos es más fácil de lo que piensas, y además es económico. Con ingredientes simples que probablemente ya tienes en casa, puedes hacer productos efectivos y seguros.</p>

<h2>Ingredientes Básicos</h2>
<p>Estos son los ingredientes esenciales para tu arsenal de limpieza ecológica:</p>

<h3>Bicarbonato de Sodio</h3>
<p><strong>Usos:</strong> Desodorante, abrasivo suave, blanqueador</p>
<p><strong>Por qué funciona:</strong> Es levemente abrasivo y neutraliza olores</p>

<h3>Vinagre Blanco</h3>
<p><strong>Usos:</strong> Desinfectante, desincrustante, limpiador multiusos</p>
<p><strong>Por qué funciona:</strong> Su acidez disuelve grasa, cal y sarro</p>

<h3>Limón</h3>
<p><strong>Usos:</strong> Desengrasante, blanqueador, aromatizante</p>
<p><strong>Por qué funciona:</strong> Ácido cítrico natural y antibacteriano</p>

<h3>Aceites Esenciales</h3>
<p><strong>Usos:</strong> Aromatizante, antibacteriano adicional</p>
<p><strong>Recomendados:</strong> Árbol de té (antimicrobiano), lavanda (calmante), limón (desengrasante)</p>

<h3>Jabón Natural</h3>
<p><strong>Usos:</strong> Base para limpiadores líquidos</p>
<p><strong>Tipo:</strong> Jabón de Castilla o jabón blanco rallado</p>

<h2>Receta 1: Limpiador Multiusos</h2>
<h3>Ingredientes:</h3>
<ul>
<li>1 taza de vinagre blanco</li>
<li>1 taza de agua</li>
<li>20 gotas de aceite esencial de limón o árbol de té</li>
<li>Cáscaras de limón o naranja (opcional)</li>
</ul>

<h3>Preparación:</h3>
<ol>
<li>Mezcla el vinagre y el agua en un pulverizador</li>
<li>Agrega el aceite esencial</li>
<li>Opcionalmente, deja macerar cáscaras de cítricos en el vinagre por una semana antes de preparar</li>
<li>Agita bien antes de usar</li>
</ol>

<h3>Usos:</h3>
<p>Encimeras, vidrios, baños, cocina. No usar en mármol o granito.</p>

<h2>Receta 2: Limpiador Cremoso Abrasivo</h2>
<h3>Ingredientes:</h3>
<ul>
<li>1 taza de bicarbonato de sodio</li>
<li>1/4 taza de jabón líquido de Castilla</li>
<li>10 gotas de aceite esencial de árbol de té</li>
<li>Agua (solo si es necesario para crear consistencia de pasta)</li>
</ul>

<h3>Preparación:</h3>
<ol>
<li>Mezcla el bicarbonato con el jabón líquido</li>
<li>Agrega aceite esencial</li>
<li>Si está muy espeso, añade agua de a poco</li>
<li>Guarda en un frasco hermético</li>
</ol>

<h3>Usos:</h3>
<p>Bañeras, lavabos, azulejos, ollas quemadas. Excelente para eliminar manchas difíciles.</p>

<h2>Receta 3: Desengrasante para Cocina</h2>
<h3>Ingredientes:</h3>
<ul>
<li>2 tazas de agua caliente</li>
<li>2 cucharadas de bicarbonato de sodio</li>
<li>2 cucharadas de jabón líquido de Castilla</li>
<li>20 gotas de aceite esencial de limón</li>
</ul>

<h3>Preparación:</h3>
<ol>
<li>Disuelve el bicarbonato en agua caliente</li>
<li>Agrega el jabón líquido y el aceite esencial</li>
<li>Mezcla suavemente (evita crear mucha espuma)</li>
<li>Vierte en un pulverizador</li>
</ol>

<h3>Usos:</h3>
<p>Estufa, campana extractora, salpicaduras de grasa, interior del horno.</p>

<h2>Receta 4: Limpiador de Vidrios</h2>
<h3>Ingredientes:</h3>
<ul>
<li>1 taza de agua</li>
<li>1 taza de vinagre blanco</li>
<li>1 cucharada de maicena</li>
</ul>

<h3>Preparación:</h3>
<ol>
<li>Mezcla todos los ingredientes en un pulverizador</li>
<li>Agita muy bien antes de cada uso (la maicena tiende a asentarse)</li>
</ol>

<h3>Usos:</h3>
<p>Ventanas, espejos, puertas de vidrio. Deja los vidrios sin rayas.</p>

<h2>Receta 5: Desinfectante para Baños</h2>
<h3>Ingredientes:</h3>
<ul>
<li>1/2 taza de bicarbonato de sodio</li>
<li>1/2 taza de vinagre blanco</li>
<li>10 gotas de aceite esencial de árbol de té</li>
<li>10 gotas de aceite esencial de lavanda</li>
</ul>

<h3>Preparación para uso inmediato:</h3>
<ol>
<li>Espolvorea el bicarbonato en el inodoro o superficie</li>
<li>Rocía el vinagre encima (creará espuma, ¡es normal!)</li>
<li>Deja actuar 10-15 minutos</li>
<li>Friega con un cepillo</li>
<li>Enjuaga</li>
</ol>

<h3>Usos:</h3>
<p>Inodoros, bañeras, azulejos, juntas de silicona.</p>

<h2>Receta 6: Suavizante de Ropa</h2>
<h3>Ingredientes:</h3>
<ul>
<li>2 tazas de vinagre blanco</li>
<li>20 gotas de aceite esencial de lavanda</li>
</ul>

<h3>Uso:</h3>
<p>Agrega 1/4 taza al ciclo de enjuague. El vinagre suaviza las fibras y elimina olores (el olor a vinagre desaparece al secar).</p>

<h2>Receta 7: Limpiador de Pisos</h2>
<h3>Ingredientes:</h3>
<ul>
<li>1 galón de agua caliente</li>
<li>1/4 taza de vinagre blanco</li>
<li>2 cucharadas de jabón líquido de Castilla</li>
<li>10 gotas de aceite esencial de pino o eucalipto</li>
</ul>

<h3>Uso:</h3>
<p>Mezcla en un balde y trapea normalmente. Seguro para madera, cerámica y vinilo.</p>

<h2>Receta 8: Desodorante Natural para Ambientes</h2>
<h3>Ingredientes:</h3>
<ul>
<li>1 taza de agua</li>
<li>2 cucharadas de vodka o alcohol de cereales (actúa como conservante)</li>
<li>20 gotas de tu aceite esencial favorito</li>
</ul>

<h3>Preparación:</h3>
<ol>
<li>Mezcla todos los ingredientes en un pulverizador</li>
<li>Agita antes de cada uso</li>
</ol>

<h2>Consejos Importantes</h2>

<h3>Seguridad:</h3>
<ul>
<li>Nunca mezcles vinagre con peróxido de hidrógeno (crea ácido peracético, tóxico)</li>
<li>Etiqueta todos tus productos claramente</li>
<li>Guarda fuera del alcance de niños y mascotas</li>
<li>Haz pruebas en áreas pequeñas primero</li>
</ul>

<h3>Almacenamiento:</h3>
<ul>
<li>Usa frascos de vidrio oscuro o botellas opacas</li>
<li>Guarda en lugares frescos y secos</li>
<li>La mayoría duran de 3-6 meses</li>
</ul>

<h3>Superficies que Evitar:</h3>
<ul>
<li><strong>Vinagre:</strong> Mármol, granito, piedra natural (es muy ácido)</li>
<li><strong>Bicarbonato:</strong> Superficies de aluminio (puede mancharlas)</li>
</ul>

<h2>Ventajas de los Productos Ecológicos Caseros</h2>
<ul>
<li><strong>Económico:</strong> Cuestan una fracción de los productos comerciales</li>
<li><strong>Seguro:</strong> No hay químicos tóxicos</li>
<li><strong>Ecológico:</strong> No contamina el agua ni el medio ambiente</li>
<li><strong>Efectivo:</strong> Funcionan tan bien como los productos comerciales</li>
<li><strong>Versátil:</strong> Los mismos ingredientes sirven para múltiples usos</li>
</ul>

<h2>Conclusión</h2>
<p>Hacer tus propios productos de limpieza ecológicos es simple, económico y beneficioso para tu salud y el planeta. Comienza con una o dos recetas y gradualmente reemplaza todos tus productos comerciales. Tu hogar quedará igual de limpio, pero con la tranquilidad de saber exactamente qué estás usando.</p>
    `,
    excerpt: "Descubre cómo crear productos de limpieza ecológicos en casa con ingredientes naturales. Recetas probadas, económicas y efectivas para toda la casa.",
    author: "Ana Rodríguez",
    tags: ["ecológico", "limpieza", "natural", "DIY", "sustentable", "ahorro"],
    category: "Productos Ecológicos",
    status: "published",
  },
];

async function seedBlogs() {
  try {
    // Connect to database
    await connectDB();
    console.log("📦 Connected to database");

    // Find an admin user to assign as creator
    const adminUser = await User.findOne({ adminRole: { $in: ["owner", "super_admin", "admin"] } });

    if (!adminUser) {
      console.error("❌ No admin user found. Please create an admin user first.");
      process.exit(1);
    }

    console.log(`👤 Using admin user: ${adminUser.name}`);

    // Clear existing blog posts
    await BlogPost.deleteMany({});
    console.log("🗑️  Cleared existing blog posts");

    // Create blog posts
    const posts = await BlogPost.create(
      blogPosts.map(post => ({
        ...post,
        createdBy: adminUser._id,
        publishedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
      }))
    );

    console.log(`✅ Created ${posts.length} blog posts:`);
    posts.forEach(post => {
      console.log(`   - ${post.title} (${post.slug})`);
    });

    console.log("\n🎉 Blog seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding blogs:", error);
    process.exit(1);
  }
}

// Run the seed function
seedBlogs();
