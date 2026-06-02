
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const corsMiddleware = require("./middlewares/cors.middleware");
const routes = require("./routes");
const { createCommentRouter } = require("./comments/routes");
const prisma = require("./config/db");
const { requireAuth } = require("./middlewares/auth.middleware");

const app = express();

app.use(express.json({ limit: "300kb" }));
app.use(cookieParser());
app.use(corsMiddleware);

// Static pages for admin panel (assuming they exist or keep structure)
const frontendRoot = path.join(__dirname, "../../frontend/src");
app.use(express.static(frontendRoot));

app.get("/admin/login", (_req, res) => {
  res.redirect(302, "/admin-login.html");
});
app.get("/admin/dashboard/posts", (_req, res) => {
  res.redirect(302, "/admin-posts.html");
});
app.get("/admin/dashboard/posts/new", (_req, res) => {
  res.redirect(302, "/admin-post-editor.html");
});
app.get("/admin/dashboard/posts/:id/edit", (req, res) => {
  res.redirect(302, `/admin-post-editor.html?id=${Number(req.params.id) || ""}`);
});

// Use consolidated API routes
app.use("/api", routes);

// Use existing comments router
app.use("/api/comments", createCommentRouter({ prisma, requireAuth, logger: console.log }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
