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
const Order = require("../../models/orderSchema")
const mongoose = require("mongoose");

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
      startDate: { $lt: new Date(today) },
      endDate: { $gt: new Date(today) },
    });

    const userId = req.session.user;
    const categories = await Category.find({ isListed: true });

    // Latest Products (like “Editor’s Pick” or recent)
    const latestProducts = await Product.find({
      isBlocked: false,
      category: { $in: categories.map(c => c._id) },
    })
      .sort({ createdAt: -1 })
      .limit(4);

    // 🔥 Aggregate Top Products from Orders
    const topProductsData = await Order.aggregate([
      { $unwind: "$product" },
      { $match: { status: { $ne: "Cancelled" } } },
      {
        $group: {
          _id: "$product._id", // Group by product ID
          totalSold: { $sum: "$product.quantity" }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 4 }
    ]);

    const topProductIds = topProductsData.map(p => p._id);

    const topProducts = await Product.find({
      _id: { $in: topProductIds },
      isBlocked: false
    });

    const userData = userId ? await User.findById(userId) : null;

    
    res.render("home", {
      user: userData,
      products: latestProducts,
      topProducts,
      banner: findBanner || []
    });
    

  } catch (error) {
    console.error("Home page error:", error);
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

        const wishlistProductIds = userData?.wishlist?.map(id => id.toString()) || [];

        const categories = await Category.find({ isListed: true });
        const categoryIds = categories.map((category) => category._id.toString());

        const brands = await Brand.find({ isBlocked: false });
        const brandNames = brands.map((brand) => brand.brandName); // assuming Product uses brandName, not brand _id

            // Extract query params
        const {
        category,
        brand,
        gt,
        lt,
        page = 1,
        sortBy,
        query
        } = req.query;

        const limit = 9;
        const skip = (page - 1) * limit;

        // Build product query
        const filter = {
        isBlocked: false,
        category: { $in: categoryIds },
        brand: { $in: brandNames },
        $or: [
            { 'sizes.S': { $gt: 0 } },
            { 'sizes.M': { $gt: 0 } },
            { 'sizes.L': { $gt: 0 } }
        ]
        };

        // Apply filters from query
        if (category) filter.category = category;
        if (brand) filter.brand = brand;
        if (gt && lt) filter.salePrice = { $gte: parseInt(gt), $lte: parseInt(lt) };
        if (query) filter.productName = { $regex: query, $options: 'i' };

        // Apply sorting
        let sortOption = { createdAt: -1 }; // Default: Newest first
        if (sortBy === 'lowToHigh') sortOption = { salePrice: 1 };
        else if (sortBy === 'highToLow') sortOption = { salePrice: -1 };
        else if (sortBy === 'aToZ') sortOption = { productName: 1 };
        else if (sortBy === 'zToA') sortOption = { productName: -1 };

        // Count and fetch products
        const totalProducts = await Product.countDocuments(filter);
        const products = await Product.find(filter).sort(sortOption).skip(skip).limit(limit);

        const totalPages = Math.ceil(totalProducts / limit);

        res.render("shop", {
        user: userData,
        products,
        category: categories,
        brand: brands,
        totalProducts,
        currentPage: parseInt(page),
        totalPages,
        wishlistProductIds,
        selectedCategory: category || null,
        selectedBrand: brand || null,
        priceRange: gt && lt ? { gt, lt } : null,
        sortBy: sortBy || '',
        query: query || ''
        });

    } catch (error) {
        console.log("Error in loadShoppingPage:", error);
        res.redirect("/pagenotfound");
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
      const userDataToSave = {
        name: user.name,
        email: user.email,
        phone: user.phone,
        password: passwordHash,
        referredBy: user.referralCode || null,
        };

        // Do NOT set googleId unless it exists
        if (user.googleId) {
        userDataToSave.googleId = user.googleId;
        }

        const saveUserData = new User(userDataToSave);
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
      logout, 
    searchProducts}