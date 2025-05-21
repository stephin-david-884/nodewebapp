const express = require("express")
const router = express.Router();
const userController = require("../controllers/user/userController")
const passport = require("passport")
const profileController = require("../controllers/user/profileController")
const {userAuth} = require("../middlewares/auth")
const productController = require("../controllers/user/productController")
const wishlistController = require("../controllers/user/wishlistController")
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/profile");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1E9) + ext;
    cb(null, uniqueName);
  }
});

const uploads = multer({ storage: storage });

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
router.post("/reset-password", profileController.postNewPassword);
router.get("/userProfile", userAuth, profileController.userProfile);
router.get("/change-email", userAuth, profileController.changeEmail);
router.post("/change-email", userAuth, profileController.changeEmailValid);
router.post("/verify-email-otp", userAuth, profileController.verifyEmailOtp);
router.post("/update-email", userAuth, profileController.updateEmail);
router.get("/change-password", userAuth, profileController.changePassword);
router.post("/change-password", userAuth, profileController.changePasswordValid);
router.post("/verify-changepassword-otp", userAuth, profileController.verifyChangePassword);
router.post("/resend-changepassword-otp", userAuth, profileController.resendOtp)
router.post("/upload-profile-pic",userAuth,uploads.single("profileImage"), profileController.changeProfilePic)

//Address Management
router.get("/addAddress", userAuth, profileController.addAddress);
router.post("/addAddress", userAuth, profileController.postAddAddress)
router.get("/editAddress", userAuth, profileController.editAddress);
router.post("/editAddress", userAuth, profileController.postEditAddress);
router.get("/deleteAddress", userAuth, profileController.deleteAddress)

//Product Management
router.get("/productDetails", userAuth, productController.productDetails)


//Wishlist Management
router.get("/wishlist", userAuth,wishlistController.loadWishlist);
router.post("/addToWishlist", userAuth, wishlistController.addToWishlist)
router.get("/removeFromWishlist", userAuth, wishlistController.removeProduct)

module.exports = router