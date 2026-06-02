
const express = require("express");
const { createRequest } = require("../controllers/request.controller");

const router = express.Router();

router.post("/requests", (req, res) => createRequest(req, res));
router.post("/volunteer-requests", (req, res) => createRequest(req, res, req.body?.type || "volunteer"));

module.exports = router;
