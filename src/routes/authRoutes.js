import express from "express";
import {
  exchangeTrueLayerToken,
  getProfile,
  login,
  loginLimiter,
  register,
  registrationLimiter,
} from "../controllers/authController.js";
import { authenticateJWT } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", registrationLimiter, register);
router.post("/login", loginLimiter, login);

router.get("/profile", authenticateJWT, getProfile);

// TrueLayer integration routes
router.post("/truelayer/connect", authenticateJWT, exchangeTrueLayerToken);

export default router;
