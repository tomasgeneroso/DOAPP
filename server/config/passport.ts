import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { User } from "../models/sql/User.model.js";
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
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0].value || '';

          // Primero buscar por googleId
          let user = await User.findOne({ where: { googleId: profile.id } });

          if (user) {
            return done(null, user);
          }

          // Si no existe por googleId, buscar por email para vincular cuentas
          if (email) {
            user = await User.findOne({ where: { email } });
            if (user) {
              // Vincular cuenta existente con Google
              user.googleId = profile.id;
              if (!user.avatar && profile.photos?.[0].value) {
                user.avatar = profile.photos[0].value;
              }
              user.isVerified = true;
              await user.save();
              console.log(`✅ Cuenta Google vinculada con usuario existente: ${email}`);
              return done(null, user);
            }
          }

          // Si no existe, crear nuevo usuario
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName || 'Google User',
            username: email.split('@')[0] || `google_${profile.id}`,
            email,
            passwordHash: '', // No necesario para OAuth
            avatar: profile.photos?.[0].value,
            isVerified: true, // Verificado por Google
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