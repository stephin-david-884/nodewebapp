const express = require("express")
const router = express.Router();
const userController = require("../controllers/user/userController")
const passport = require("passport")
const profileController = require("../controllers/user/profileController")
const {userAuth} = require("../middlewares/auth")
const productController = require("../controllers/user/productController")

router.get("/pagenotfound", userController.pageNotFound)

// Home page & Shopping page
router.get("/",userController.loadHomepage);
router.get("/shop", userAuth, userController.loadShoppingPage)
router.get("/filter", userAuth, userController.filterProduct)
router.get("/filterPrice", userAuth, userController.filterPrice)
router.post("/search", userAuth, userController.searchProducts)


// Sign up Management
router.get("/signup",userController.loadSignup)

router.post("/signup", userController.signup)
router.post("/verify-otp", userController.verifyOtp)
router.post("/resend-otp", userController.resendOtp)


// Login Management 
router.get("/login",userController.loadLogin)
router.post("/login",userController.login)
router.get("/logout",userController.logout)

router.get("/auth/google",passport.authenticate('google',{scope:['profile','email']}));

router.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/signup" }),
    (req, res) => {
      // Set req.session.user so your system recognizes the user
      req.session.user = req.user;
      res.redirect("/");
    }
  );
  


//Profile Management
router.get("/forgot-password", profileController.getForgotPassPage);
router.post("/forgot-email-valid", profileController.forgotEmailValid);
router.post("/verify-passForgot-otp", profileController.verifyForgotPassOtp);
router.get("/reset-password", profileController.getResetPassPage);
router.post("/resend-forgot-otp", profileController.resendOtp);
router.post("/reset-password", profileController.postNewPassword)


//Product Management
router.get("/productDetails", userAuth, productController.productDetails)

module.exports = router