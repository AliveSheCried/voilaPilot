const express = require("express");
const { authenticateJWT } = require("../middleware/auth");
const {
  validateTransactionParams,
} = require("../middleware/trueLayerValidation");
const {
  getAccounts,
  getTransactions,
} = require("../controllers/trueLayerController");

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

module.exports = router;
