import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { col, fn, where } from "sequelize";
import { User } from "../models/sql/User.model.js";
import { COOKIE_DE_VINCULO, leerVinculo } from "../services/vincularCuentaSocial.js";
import { config } from "./env.js";

// Configurar Google OAuth solo si las credenciales están disponibles
if (config.googleClientId && config.googleClientSecret) {
  console.log("✅ Google OAuth configurado");
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.googleClientId,
        clientSecret: config.googleClientSecret,
        callbackURL: `${config.serverUrl}/api/auth/google/callback`,
        passReqToCallback: true,
      },
      async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          // Enlazar desde Configuración → Seguridad: NO se busca por correo ni se crea una cuenta; solo se devuelve a quién se enlaza
          // (el token firmado y la cookie del navegador que inició el enlace tienen que coincidir). El callback hace el enlace.
          const estado = String(req?.query?.state || '');
          if (estado.startsWith('link:')) {
            const userId = leerVinculo(estado.slice(5), req?.cookies?.[COOKIE_DE_VINCULO], 'google');
            return done(null, { __vincular: true, userId, googleId: profile.id, avatar: profile.photos?.[0]?.value });
          }

          // Con `?.` en cada paso: un perfil sin foto o sin correo no puede tumbar el ingreso con un TypeError.
          const email = String(profile.emails?.[0]?.value || '').trim().toLowerCase();
          const foto = profile.photos?.[0]?.value;

          // Primero buscar por googleId
          let user = await User.findOne({ where: { googleId: profile.id } });

          if (user) {
            return done(null, user);
          }

          // Si no existe por googleId, buscar por email para vincular cuentas
          if (email) {
            // Sin distinguir mayúsculas ni espacios: el correo que devuelve Google es el mismo de la cuenta aunque se haya
            // guardado escrito distinto (la base lo trata como el mismo; buscar exacto y no encontrarla terminaba en un error
            // de «correo ya en uso» al querer crear una cuenta nueva).
            user = await User.findOne({ where: where(fn('lower', fn('trim', col('email'))), email) });
            if (user) {
              // Vincular cuenta existente con Google
              user.googleId = profile.id;
              if (!user.avatar && foto) {
                user.avatar = foto;
              }
              user.isVerified = true;
              // Solo estos tres campos: una cuenta vieja con otro dato que no pasa las validaciones de hoy no puede impedir entrar.
              await user.save({ fields: ['googleId', 'avatar', 'isVerified'] });
              console.log(`✅ Cuenta Google vinculada con usuario existente: ${email}`);
              return done(null, user);
            }
          }

          // Si no existe, crear nuevo usuario — con un username válido y único
          // (el prefijo del email puede colisionar o no cumplir las reglas)
          let base = (email.split('@')[0] || `google${profile.id}`)
            .toLowerCase()
            .replace(/[^a-z0-9._]/g, '')
            .replace(/^[._]+|[._]+$/g, '')
            .replace(/[._]{2,}/g, '.')
            .slice(0, 25);
          if (base.length < 3) base = `user${profile.id}`.slice(0, 25);
          let username = base;
          let attempt = 0;
          // eslint-disable-next-line no-await-in-loop
          while (await User.findOne({ where: { username }, attributes: ['id'] })) {
            attempt += 1;
            username = `${base}${attempt}`.slice(0, 30);
          }

          user = await User.create({
            googleId: profile.id,
            name: profile.displayName || 'Google User',
            username,
            email,
            avatar: foto,
            isVerified: true, // Verificado por Google
            termsAccepted: true, // Asumimos aceptación al usar social login
            termsAcceptedAt: new Date(),
          });

          return done(null, user);
        } catch (error: any) {
          console.error('❌ Google OAuth strategy error:', error?.name, error?.message, (error?.errors || []).map((e: any) => e.message));
          return done(error, false);
        }
      }
    )
  );
} else {
  console.log("⚠️  Google OAuth deshabilitado (credenciales no configuradas)");
}

// Configurar Facebook OAuth solo si las credenciales están disponibles
if (config.facebookAppId && config.facebookAppSecret) {
  console.log("✅ Facebook OAuth configurado");
  passport.use(
    new FacebookStrategy(
      {
        clientID: config.facebookAppId,
        clientSecret: config.facebookAppSecret,
        callbackURL: `${config.serverUrl}/api/auth/facebook/callback`,
        profileFields: ["id", "displayName", "emails", "photos"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ where: { facebookId: profile.id } });

          if (user) {
            return done(null, user);
          }

          // Si no existe, lo creamos
          user = await User.create({
            facebookId: profile.id,
            name: profile.displayName || 'Facebook User',
            username: profile.emails?.[0].value.split('@')[0] || `facebook_${profile.id}`,
            email: profile.emails?.[0].value || '',
            passwordHash: '', // No necesario para OAuth
            avatar: profile.photos?.[0].value,
            isVerified: true, // Verificado por Facebook
            termsAccepted: true, // Asumimos aceptación al usar social login
            termsAcceptedAt: new Date(),
          });

          return done(null, user);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );
} else {
  console.log("⚠️  Facebook OAuth deshabilitado (credenciales no configuradas)");
}

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;