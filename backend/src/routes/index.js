
const express = require("express");
const authRoutes = require("./auth.routes");
const adminRoutes = require("./admin.routes");
const publicRoutes = require("./public.routes");
const requestRoutes = require("./request.routes");
const internalRoutes = require("./internal.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/internal", internalRoutes);
router.use("/", publicRoutes);
router.use("/", requestRoutes);

// General health check
router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

module.exports = router;
