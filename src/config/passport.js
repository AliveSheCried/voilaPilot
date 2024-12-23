import passport from "passport";
import { ExtractJwt, Strategy as JwtStrategy } from "passport-jwt";
import TokenBlacklist from "../models/TokenBlacklist.js";
import User from "../models/User.js";
import config from "./config.js";
import logger from "./logger.js";

const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.jwt.secret,
  ignoreExpiration: false,
};

passport.use(
  new JwtStrategy(options, async (jwt_payload, done) => {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await TokenBlacklist.exists({
        token: jwt_payload.jti, // JWT ID
      });

      if (isBlacklisted) {
        logger.warn("JWT rejected: Token is blacklisted", {
          jti: jwt_payload.jti,
        });
        return done(null, false, { message: "Token has been revoked" });
      }

      // Find user by ID from JWT payload
      const user = await User.findById(jwt_payload.id)
        .select("-password")
        .lean();

      if (!user) {
        logger.warn("JWT validation failed: User not found", {
          userId: jwt_payload.id,
        });
        return done(null, false, { message: "User not found" });
      }

      if (!user.isActive || user.isDeleted) {
        logger.warn("JWT validation failed: Inactive or deleted user", {
          userId: jwt_payload.id,
        });
        return done(null, false, { message: "User account is inactive" });
      }

      logger.debug("JWT validation successful", {
        userId: jwt_payload.id,
      });

      return done(null, user);
    } catch (error) {
      logger.error("JWT validation error:", {
        error: error.message,
        stack: error.stack,
      });
      return done(error);
    }
  })
);

export default passport;
