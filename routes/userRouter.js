const express = require("express")
const router = express.Router();
const userController = require("../controllers/user/userController")

router.get("/pagenotfound", userController.pageNotFound)
router.get("/",userController.loadHomepage)


module.exports = router