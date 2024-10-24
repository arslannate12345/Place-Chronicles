const express = require("express");

const { check } = require("express-validator");

const router = express.Router();

const usersControllers = require("../controllers/users-controllers");

const fileUpload = require("../middleware/file-upload");
router.get("/", usersControllers.getUser);

router.post(
  "/signup",
  fileUpload.single("image"),
  [
    check("name").not().isEmpty(),
    check("email").normalizeEmail().isEmail(),
    check("password").isLength({ min: 5 }),
  ],
  usersControllers.signUp
);

router.post("/login", usersControllers.login);
module.exports = router;
