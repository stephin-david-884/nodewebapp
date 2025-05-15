const User = require("../../models/userSchema")
const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema")
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt");
const { Session } = require("express-session");
const env = require("dotenv").config();

const pageNotFound = async (req,res) => {
    try {
        res.render("page-404")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}

const loadHomepage = async (req, res) => {
    try {
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
            res.render("home", { user: userData, products:productData });
        } else {
            res.render("home", {products:productData});
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

const loadShopping = async (req,res) => {
    try {
        return res.render('shop');
    } catch (error) {
        console.log('Shopping page not loading:',error);
        res.status(500).send('Server error')
    }
}

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

const signup = async (req,res) => {
    
    try {

        const {name,phone,email,password,cPassword}=req.body;

        if(password!=cPassword){
            return res.render("signup",{message:"Passwords donot match"})
        }
        
        const findUser = await User.findOne({email});
        if(findUser){
            return res.render("signup",{message:"User with this  mail id already exists"})
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email,otp);
        if(!emailSent){
            return res.json("email-error")
        }
        req.session.userOtp = otp;
        req.session.userData = {name,phone,email,password};

        res.render("verify-otp")
        console.log("OTP Sent",otp);
        
        
    } catch (error) {

        console.error("signup error",error);
        res.redirect("/pageNotFound")
        
    }
}

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password,10);

        return passwordHash;

    } catch (error) {
        console.error(error);
        
    }
}

const verifyOtp =async (req,res) => {
    try {
        const {otp} = req.body;
        console.log(otp);

        if(otp===req.session.userOtp){
            const user = req.session.userData
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name:user.name,
                email:user.email,
                phone:user.phone,
                password:passwordHash,
            })
            await saveUserData.save();
            req.session.user = saveUserData._id;
            res.json({success:true, redirectUrl:"/"})
        }else{
            res.status(400).json({success:false, message:"Invalid OTP, Please try again"})
        }
        
    } catch (error) {
        console.error("Error verifying OTP",error);
        res.status(500).json({success:false, message:"An error occured"})
    }
}

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

module.exports = {loadHomepage, pageNotFound, loadShopping, loadSignup, signup, verifyOtp, resendOtp, loadLogin, login,logout}