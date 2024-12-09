const passport = require("passport");
const logger = require("../config/logger");

const authenticateJWT = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user, info) => {
    if (err) {
      logger.error("JWT authentication error:", {
        error: err.message,
        ip: req.ip,
      });
      return next(err);
    }

    if (!user) {
      logger.warn("JWT authentication failed:", {
        info: info?.message,
        ip: req.ip,
      });
      return res.status(401).json({
        status: "error",
        message: info?.message || "Unauthorized",
      });
    }

    req.user = user;
    next();
  })(req, res, next);
};

module.exports = {
  authenticateJWT,
};
