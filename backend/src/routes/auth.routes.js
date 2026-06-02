
const express = require("express");
const { login, logout, getMe } = require("../controllers/auth.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);

module.exports = router;
