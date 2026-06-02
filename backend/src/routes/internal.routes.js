
const express = require("express");
const { syncMono, getHealth } = require("../controllers/internal.controller");
const { requireInternalToken } = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(requireInternalToken);
router.post("/mono/sync", syncMono);
router.get("/health", getHealth);

module.exports = router;
