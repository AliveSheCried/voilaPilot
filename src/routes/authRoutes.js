const express = require("express");
const {
  register,
  registrationLimiter,
  login,
  loginLimiter,
  getProfile,
  exchangeTrueLayerToken,
} = require("../controllers/authController");
const { authenticateJWT } = require("../middleware/auth");

const router = express.Router();

router.post("/register", registrationLimiter, register);
router.post("/login", loginLimiter, login);

router.get("/profile", authenticateJWT, getProfile);

// TrueLayer integration routes
router.post("/truelayer/connect", authenticateJWT, exchangeTrueLayerToken);

module.exports = router;
