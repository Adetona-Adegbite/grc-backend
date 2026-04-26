import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "./prisma";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const fullName = profile.displayName;
        const avatarUrl = profile.photos?.[0]?.value;
        const googleId = profile.id;

        if (!email) {
          return done(new Error("No email found in Google profile"), undefined);
        }

        // Check if user already exists by googleId or email
        let user = await prisma.user.findFirst({
          where: {
            OR: [{ googleId }, { email }],
          },
          include: {
            userCompanies: true,
          },
        });

        if (user) {
          // Update googleId if missing
          if (!user.googleId) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { googleId },
              include: { userCompanies: true },
            });
          }
          return done(null, user as any);
        }

        // New user — create without company for now
        const newUser = await prisma.user.create({
          data: {
            email,
            fullName,
            googleId,
            ...(avatarUrl !== undefined && { avatarUrl }),
          },
          include: { userCompanies: true },
        });

        return done(null, newUser as any);
      } catch (error) {
        return done(error, undefined);
      }
    }
  )
);

export default passport;
