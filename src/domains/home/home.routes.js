const express = require("express");
const { getHomeModel } = require("./home.service");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const model = await getHomeModel({ date: req.query.date });
    return res.status(200).render("home/index", model);
  } catch (err) {
    return res.status(400).send(err && err.message ? err.message : "Unable to load home");
  }
});

module.exports = router;
