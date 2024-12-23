import express from "express";
import {
  getAccounts,
  getTransactions,
} from "../controllers/trueLayerController.js";
import { authenticateJWT } from "../middleware/auth.js";
import { validateTransactionParams } from "../middleware/trueLayerValidation.js";

const router = express.Router();

// Protect all TrueLayer routes with JWT authentication
router.use(authenticateJWT);

// Account endpoints
router.get("/accounts", getAccounts);

// Transaction endpoints
router.get("/transactions", validateTransactionParams, getTransactions);
router.get(
  "/accounts/:accountId/transactions",
  validateTransactionParams,
  getTransactions
);

export default router;
