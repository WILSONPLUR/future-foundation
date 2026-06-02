
const express = require("express");
const {
  getCampaigns, getCampaignBySlug, refreshCampaigns,
  getPartners, getFaqs, getCases, getCaseBySlug,
  getPosts, getPostBySlug, getReports, getActivities,
  getHelpOptions, getReviews
} = require("../controllers/public.controller");

const router = express.Router();

router.get("/campaigns", getCampaigns);
router.get("/campaigns/:slug", getCampaignBySlug);
router.post("/campaigns/refresh", refreshCampaigns);
router.get("/partners", getPartners);
router.get("/faqs", getFaqs);
router.get("/cases", getCases);
router.get("/cases/:slug", getCaseBySlug);
router.get("/posts", getPosts);
router.get("/posts/:slug", getPostBySlug);
router.get("/reports", getReports);
router.get("/activities", getActivities);
router.get("/help-options", getHelpOptions);
router.get("/reviews", getReviews);

module.exports = router;
