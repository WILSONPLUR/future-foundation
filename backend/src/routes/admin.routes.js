
const express = require("express");
const { getPosts, getPostById, createPost, updatePost, updatePostStatus, deletePost } = require("../controllers/admin.controller");
const { requireAuth, requireRole } = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(requireAuth);
router.get("/posts", getPosts);
router.get("/posts/:id", getPostById);
router.post("/posts", createPost);
router.patch("/posts/:id", updatePost);
router.patch("/posts/:id/status", updatePostStatus);
router.delete("/posts/:id", requireRole("admin"), deletePost);

module.exports = router;
