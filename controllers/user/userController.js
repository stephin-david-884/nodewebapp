const User = require("../../models/userSchema")
const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema")
const Brand = require("../../models/brandSchema")
const Banner = require("../../models/bannerSchema")
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt");
const { Session } = require("express-session");
const env = require("dotenv").config();
const Coupon = require("../../models/couponSchema")

const pageNotFound = async (req,res) => {
    try {
        res.render("page-404")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}

const loadHomepage = async (req, res) => {
    try {
        const today = new Date().toISOString();
        const findBanner = await Banner.find({
            startDate:{$lt:new Date(today)},
            endDate:{$gt: new Date(today)},
        })
        const user = req.session.user;
        const categories = await Category.find({isListed:true})
        let productData = await Product.find(
            {
                isBlocked:false,
                category:{$in:categories.map(category=>category._id)},
                quantity:{$gt:0}
            }
        )

        productData.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        productData = productData.slice(0,4); 

        if (user) {
            const userData = await User.findOne({_id: user._id});
            res.render("home", { user: userData, products:productData, banner:findBanner || [] });
        } else {
            res.render("home", {products:productData, banner:findBanner || []});
        }
    } catch (error) {
        console.log("Home page not found", error);
        res.status(500).send("Server error");
    }
};


const loadSignup = async (req,res) => {
    try {
        return res.render('signup');

    } catch (error) {
        console.log('Signup page not loading:',error);
        res.status(500).send('Server error')
        
    }
}

const loadShoppingPage = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });

        const categories = await Category.find({ isListed: true });
        const categoryIds = categories.map((category) => category._id.toString());

        const brands = await Brand.find({ isBlocked: false });
        const brandNames = brands.map((brand) => brand.brandName); // assuming Product uses brandName, not brand _id

        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;

        const query = {
            isBlocked: false,
            category: { $in: categoryIds },
            brand: { $in: brandNames }, // Filter by active brands
            quantity: { $gt: 0 },
        };

        const products = await Product.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        const categoriesWithIds = categories.map((category) => ({
            _id: category._id,
            name: category.name,
        }));

        res.render("shop", {
            user: userData,
            products: products,
            category: categoriesWithIds,
            brand: brands,
            totalProducts: totalProducts,
            currentPage: page,
            totalPages: totalPages,
        });

    } catch (error) {
        console.log("Shopping page not loading:", error);
        res.status(500).send("Server error");
    }
};


function generateOtp() {
    return Math.floor(100000 + Math.random()*900000).toString()
}

async function sendVerificationEmail(email,otp) {
    try {
        const transporter = nodemailer.createTransport({
        service:'gmail',
        port:587,
        secure:false,
        auth:{
            user:process.env.NODEMAILER_EMAIL,
            pass:process.env.NODEMAILER_PASSWORD
        }
        })

        const info = await transporter.sendMail({
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Verify your email",
            text:`Your OTP is ${otp} `,
            html:`<b>Your OTP: ${otp}</b>`,
        })

        return info.accepted.length>0

    } catch (error) {
        console.error("Error sending email",error);
        return false;
    }
}

const signup = async (req, res) => {
  try {
    const { name, phone, email, password, cPassword, referralCode } = req.body;

    if (password !== cPassword) {
      return res.render("signup", { message: "Passwords do not match" });
    }

    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render("signup", { message: "User with this email already exists" });
    }

    // Optional: Validate referralCode exists if entered
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (!referrer) {
        return res.render("signup", { message: "Invalid referral code" });
      }
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.json("email-error");
    }

    // Save user data + referral code in session
    req.session.userOtp = otp;
    req.session.userData = {
      name,
      phone,
      email,
      password,
      referralCode: referralCode || null,
    };

    res.render("verify-otp");
    console.log("OTP Sent", otp);

  } catch (error) {
    console.error("signup error", error);
    res.redirect("/pagenotfound");
  }
};


const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password,10);

        return passwordHash;

    } catch (error) {
        console.error(error);
        
    }
}

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (otp === req.session.userOtp) {
      const user = req.session.userData;
      const passwordHash = await securePassword(user.password);

      // Save the new user
      const saveUserData = new User({
        name: user.name,
        email: user.email,
        phone: user.phone,
        password: passwordHash,
        referredBy: user.referralCode || null, // Save referral code if it was entered
      });

      await saveUserData.save();

      // ✅ If referral code exists, reward the referrer
      if (user.referralCode) {
        const referrer = await User.findOne({ referralCode: user.referralCode });

        if (referrer) {
          const referralCoupon = new Coupon({
            name: `REF1000-${Date.now()}`,
            offerPrice: 1000,
            minimumPrice: 1000,
            expireOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days validity
            userId: [referrer._id],
            isList: false // personal coupon
          });

          await referralCoupon.save();
        }
      }

      req.session.user = saveUserData._id;
      res.json({ success: true, redirectUrl: "/" });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP, Please try again" });
    }

  } catch (error) {
    console.error("Error verifying OTP", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};


const resendOtp = async (req,res) => {
    try {
        
        const {email} = req.session.userData;
        if(!email){
            return res.status(400).json({success:false, message:"Email not found in session"})
        }
        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log("Resend OTP:",otp);
            res.status(200).json({success:true, message:"OTP Resent successfully"})
        }else{
            res.status(500).json({success:false, message:"Failed to resend OTP. Please try again"})
        }

    } catch (error) {
        console.error("Error sending OTP",error);
        res.status(500).json({success:fasle, message:"Internal server error"})
    }
}

const loadLogin = async (req,res) => {
    try {
        if(!req.session.user){
            return res.render("login")
        }else{
            res.redirect("/")
        }
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}

const login = async (req,res) => {
    try {
        const {email,password} = req.body;

        const findUser = await User.findOne({isAdmin:0, email:email});

        if(!findUser){
            return res.render("login", {message:"User not found"})
        }
        if(findUser.isBlocked){
            return res.render("login",{message:"User is blocked by admin"})
        }

        const passwordMatch = await bcrypt.compare(password,findUser.password);

        if(!passwordMatch){
            return res.render("login",{message:"Incorrect Password"})
        }

        req.session.user = findUser;
        res.redirect("/")

    } catch (error) {
        console.error("login error",error);
        res.render("login",{message:"Login failed"})
    }
}

const logout = async (req,res) => {
    try {
        
        req.session.destroy((err)=>{
            if(err){
                console.log("Session destruction error", err.message);
                return res.redirect("/pageNotFound");
            }
            return res.redirect("/login")
        })

    } catch (error) {
        console.log("Logout error",error);
        res.redirect("/pageNotFound");
    }
}

const filterProduct = async (req, res) => {
    try {
        const user = req.session.user;
        const category = req.query.category;
        const brand = req.query.brand;

        const findCategory = category ? await Category.findOne({ _id: category }) : null;
        const findBrand = brand ? await Brand.findOne({ _id: brand, isBlocked: false }) : null; // Only if brand is not blocked

        const brands = await Brand.find({ isBlocked: false }).lean(); // Only unblocked brands

        const query = {
            isBlocked: false,
            quantity: { $gt: 0 }
        };

        if (findCategory) {
            query.category = findCategory._id;
        }

        if (findBrand) {
            query.brand = findBrand.brandName;
        }

        // Ensure only products with unblocked brands are shown
        const allowedBrandNames = brands.map(b => b.brandName);
        query.brand = query.brand ? query.brand : { $in: allowedBrandNames };

        let findProducts = await Product.find(query).lean();
        findProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const categories = await Category.find({ isListed: true });

        const itemsPerPage = 6;
        const currentPage = parseInt(req.query.page) || 1;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const totalPages = Math.ceil(findProducts.length / itemsPerPage);
        const currentProduct = findProducts.slice(startIndex, endIndex);

        let userData = null;
        if (user) {
            userData = await User.findOne({ _id: user });
            if (userData) {
                const searchEntry = {
                    category: findCategory ? findCategory._id : null,
                    brand: findBrand ? findBrand.brandName : null,
                    searchOn: new Date(),
                };
                userData.searchHistory.push(searchEntry);
                await userData.save();
            }
        }

        req.session.filteredProducts = currentProduct;

        res.render("shop", {
            user: userData,
            products: currentProduct,
            category: categories,
            brand: brands,
            totalPages,
            currentPage,
            selectedCategory: category || null,
            selectedBrand: brand || null,
        });

    } catch (error) {
        console.log("Error in filterProduct:", error);
        res.redirect("/pagenotfound");
    }
};


const filterPrice = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });

        // Fetch only unblocked brands
        const brands = await Brand.find({ isBlocked: false }).lean();
        const categories = await Category.find({ isListed: true }).lean();

        // Get allowed brand names
        const allowedBrandNames = brands.map(b => b.brandName);

        // Filter products by price and unblocked brand
        let findProducts = await Product.find({
            salePrice: { $gt: req.query.gt, $lt: req.query.lt },
            isBlocked: false,
            quantity: { $gt: 0 },
            brand: { $in: allowedBrandNames }
        }).lean();

        // Sort and paginate
        findProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const itemsPerPage = 6;
        const currentPage = parseInt(req.query.page) || 1;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const totalPages = Math.ceil(findProducts.length / itemsPerPage);
        const currentProduct = findProducts.slice(startIndex, endIndex);

        req.session.filteredProducts = findProducts;

        res.render("shop", {
            user: userData,
            products: currentProduct,
            category: categories,
            brand: brands,
            totalPages,
            currentPage,
        });

    } catch (error) {
        console.log("Error in filterPrice:", error);
        res.redirect("/pagenotfound");
    }
};


const searchProducts = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });

        let search = req.body.query;

        // Fetch only unblocked brands
        const brands = await Brand.find({ isBlocked: false }).lean();
        const allowedBrandNames = brands.map(b => b.brandName);

        const categories = await Category.find({ isListed: true }).lean();
        const categoryIds = categories.map(category => category._id.toString());

        let searchResult = [];

        // If session already has filtered products
        if (req.session.filteredProducts && req.session.filteredProducts.length > 0) {
            searchResult = req.session.filteredProducts.filter(product =>
                product.productName.toLowerCase().includes(search.toLowerCase()) &&
                allowedBrandNames.includes(product.brand)
            );
        } else {
            searchResult = await Product.find({
                productName: { $regex: ".*" + search + ".*", $options: "i" },
                isBlocked: false,
                quantity: { $gt: 0 },
                category: { $in: categoryIds },
                brand: { $in: allowedBrandNames }
            }).lean();
        }

        // Sort and paginate
        searchResult.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const itemsPerPage = 6;
        const currentPage = parseInt(req.query.page) || 1;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const totalPages = Math.ceil(searchResult.length / itemsPerPage);
        const currentProduct = searchResult.slice(startIndex, endIndex);

        res.render("shop", {
            user: userData,
            products: currentProduct,
            category: categories,
            brand: brands,
            totalPages,
            currentPage,
            count: searchResult.length,
        });

    } catch (error) {
        console.log("Error in searchProducts:", error);
        res.redirect("/pagenotfound");
    }
};


module.exports = {loadHomepage, pageNotFound, loadShoppingPage,
     loadSignup, signup, verifyOtp,
      resendOtp, loadLogin, login,
      logout, filterProduct, filterPrice,
    searchProducts}