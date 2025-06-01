const User = require("../../models/userSchema")
const Address = require("../../models/addressSchema")
const Order = require("../../models/orderSchema")
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt")
const env = require("dotenv").config();
const session = require("express-session");
const { text } = require("express");
const generateReferralCode = require('../../utils/generateReferralCode')


function generateOtp() {
    const digits = "1234567890";
    let otp = "";
    for(let i=0;i<6;i++){
        otp += digits[Math.floor(Math.random()*10)];
    }
return otp;
}

const sendVerificationEmail = async (email,otp) => {
    try {
        
        const transporter = nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD,
            }
        })

        const mailOptions = {
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Your OTP for password reset",
            text:`Your OTP is ${otp}`,
            html:`<b><h4>Your OTP: ${otp}</h4><br></b>`
        }

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info.messageId);
        return true;
        

    } catch (error) {
        console.error("Error sending email",error);
        return false;
        
    }
}

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password,10)
        return passwordHash;
    } catch (error) {
        
    }
}

const getForgotPassPage = async (req,res) => {
    try {
        
        res.render("forgot-password")

    } catch (error) {
        res.redirect("pagenotfound")
    }
}

const forgotEmailValid = async (req,res) => {
    try {
        
        const {email} = req.body;
        const findUser = await User.findOne({email:email});
        if(findUser){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.email = email;
                res.render("forgotPass-otp")
                console.log("OTP:",otp);
                
            }else{
                res.json({success:false, message:"Failed to send OTP. Please try again"});
            }
        }else{
            res.render("forgot-password",{
                message:"Wrong email. Please Enter a Valid Email"
            });
        }


    } catch (error) {
        res.redirect("/pagenotfound")
    }
}

const verifyForgotPassOtp = async (req,res) => {
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            res.json({success:true, redirectUrl:"/reset-password"});
        }else{
            res.json({success:false, message:"OTP not matching"});
        }
    } catch (error) {
        res.status(500).json({success:false,message:"An error occured. Please try again"});

    }
}

const getResetPassPage = async (req,res) => {
    try {
        res.render("reset-password");
    } catch (error) {
        res.redirect("/pagenotfound")
    }
}

const resendOtp = async (req,res) => {
    try {
        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;
        console.log("Resending OTP to email:",email);
        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log("Resend OTP:",otp);
            res.status(200).json({success:true, message:"Resend OTP Successful"})
            
        }
        

    } catch (error) {
        console.error("Error in resend OTP",error);
        res.status(500).json({success:false, message:"Internal Server Error"})
        
    }
}

const postNewPassword = async (req,res) => {
    try {
        
        const {newPass1, newPass2} = req.body
        const email = req.session.email;
        if(newPass1 === newPass2){
            const passwordHash = await securePassword(newPass1);
            await User.updateOne({email:email},{$set:{password:passwordHash}})
            res.redirect("/login");
        }else{
            res.render('reset-password',{message:'Passwords donot match'})
        }

    } catch (error) {
        res.redirect("/pagenotfound")
    }
}



const userProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const addressData = await Address.findOne({ userId });

      // ✅ Set referralCode if not already set
    if (!userData.referralCode) {
      userData.referralCode = generateReferralCode();
      await userData.save(); // Save to DB so it doesn't regenerate
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalOrders = await Order.countDocuments({ userId });
    const orders = await Order.find({ userId })
      .sort({ createdOn: -1 }) // latest first
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalOrders / limit);

     // Wallet history pagination
    const walletPage = parseInt(req.query.walletPage) || 1;
    const walletLimit = 5;
    const walletSkip = (walletPage - 1) * walletLimit;
    const walletHistory = userData.history || [];

    const paginatedHistory = walletHistory
      .sort((a, b) => new Date(b.date) - new Date(a.date)) // newest first
      .slice(walletSkip, walletSkip + walletLimit);
    const totalWalletPages = Math.ceil(walletHistory.length / walletLimit);

    const walletTransactions = userData.walletTransactions || [];

    res.render("profile", {
      user: userData,
      userAddress: addressData,
      orders,
      currentPage: page,
      totalPages,
      walletTransactions: paginatedHistory,
      walletCurrentPage: walletPage,
      walletTotalPages: totalWalletPages,
      referralCode: userData.referralCode,

    });

  } catch (error) {
    console.error("Error retrieving profile data", error);
    res.redirect("/pagenotfound");
  }
};


const changeEmail = async (req,res) => {
    try {
        res.render("change-email")
    } catch (error) {
        res.redirect("/pagenotfound")
    }
}

const changeEmailValid = async (req,res) => {
    try {
        
        const {email} = req.body;
        const userExists = await User.findOne({email});

        if(userExists){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);

            if(emailSent){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render("change-email-otp");
                console.log("Email sent:",email);
                console.log("OTP",otp);
                
                
            }else{
                res.json("email-error")
            }
        }else{
            res.render("change-email",{
                message:"User with this email already exists"
            })
        }

    } catch (error) {
        res.redirect("/pagenotfound")
    }
}

const verifyEmailOtp = async (req,res) => {
    try {
        
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            req.session.userData = req.body.userData;
            res.render("new-email",{
                userData: req.session.userData,
            })
        }else{
            res.render("change-email-otp",{
                message:"OTP not matching",
                userData: req.session.userData
            })
        }

    } catch (error) {
        res.redirect("/pagenotfound")
    }
}

const updateEmail = async (req,res) => {
    try {
        
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId,{email:newEmail});
        res.redirect("/userProfile")

    } catch (error) {
        res.redirect("/pagenotfound")
    }
}

const changePassword = async (req,res) => {
    try {
        
        res.render("change-password")

    } catch (error) {
        res.redirect("/pagenotfound")
    }
}

const changePasswordValid = async (req,res) => {
    try {
        const {email} = req.body;
        const userExists = await User.findOne({email});

        if(userExists){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render("change-password-otp");
                console.log('OTP:',otp);
                
            }else{
                res.json({
                    success:false,
                    message: "Failed to send OTP. Please try again",
                })
            }
        }else{
            res.render("change-password",{
                message:"User with this email doesnot exist"
            })
        }


    } catch (error) {
        console.log("Error in change password",error);
        
        res.redirect("/pagenotfound")
    }
}

const verifyChangePassword = async (req,res) => {
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            res.json({success:true, redirectUrl:"/reset-password"})
        }else{
            res.json({success:false, message:"OTP not matching"})
        }
    } catch (error) {
        res.status(500).json({success:false, message:"An error occured. Please try again"})
    }
}

const addAddress = async (req,res) => {
    try {
        const user = req.session.user;
        res.render("add-address",{user:user})
    } catch (error) {
        res.redirect("/pagenotfound")
    }
}

const addaddress = async (req,res) => {
    try {
        const user = req.session.user;
        res.render("add-Addres",{user:user})
    } catch (error) {
        res.redirect("/pagenotfound")
    }
}

const postAddAddress = async (req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findOne({_id:userId});
        const {addressType,name,city,landMark,state,pincode,phone,altPhone} = req.body;

        const userAddress = await Address.findOne({userId:userData._id});
        if(!userAddress){
            const newAddress = new Address({
                userId: userData._id,
                address: [{addressType,name,city,landMark,state,pincode,phone,altPhone}]
            });
            await newAddress.save();
        }else{
            userAddress.address.push({addressType,name,city,landMark,state,pincode,phone,altPhone});
            await userAddress.save();
        }
        res.redirect("/userProfile")
    } catch (error) {
        console.error("Error adding address:",error);
        res.redirect("/pagenotfound")
        
    }
}

const postAddAddres = async (req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findOne({_id:userId});
        const {addressType,name,city,landMark,state,pincode,phone,altPhone} = req.body;

        const userAddress = await Address.findOne({userId:userData._id});
        if(!userAddress){
            const newAddress = new Address({
                userId: userData._id,
                address: [{addressType,name,city,landMark,state,pincode,phone,altPhone}]
            });
            await newAddress.save();
        }else{
            userAddress.address.push({addressType,name,city,landMark,state,pincode,phone,altPhone});
            await userAddress.save();
        }
        res.redirect("/checkout")
    } catch (error) {
        console.error("Error adding address:",error);
        res.redirect("/pagenotfound")
        
    }
}

const editAddress =async (req,res) => {
    try {
        const addressId = req.query.id;
        const user = req.session.user;
        const currAddress = await Address.findOne({
            "address._id": addressId,
        });
        if(!currAddress){
            return res.redirect("/pagenotfound")
        }
        const addressData = currAddress.address.find((item)=>{
            return item._id.toString()===addressId.toString(); 
        })
        if(!addressData){
            return res.redirect("/pagenotfound")
        }

        res.render("edit-address",{address:addressData, user:user})
    } catch (error) {
        console.error("Error in editing address",error);
        res.redirect("/pagenotfound")
    }
}

const postEditAddress = async (req,res) => {
    try {
        const data = req.body;
        const addressId = req.query.id;
        const user = req.session.user;
        const findAddress = await Address.findOne({"address._id":addressId});
        if(!findAddress){
            res.redirect("/pagenotfound")
        }
        await Address.updateOne(
            {"address._id":addressId},
            {$set:{
                "address.$":{
                    _id : addressId,
                    addressType : data.addressType,
                    name: data.name,
                    city: data.city,
                    landMark: data.landMark,
                    state: data.state,
                    pincode : data.pincode,
                    phone : data.phone,
                    altPhone: data.altPhone,
                }
            }}
        )

        res.redirect("/userProfile")
    } catch (error) {
        console.error("Error in edit address",error);
        res.redirect("/pagenotfound")
    }
}

const deleteAddress = async (req,res) => {
    try {
        const addressId = req.query.id;
        const findAddress = await Address.findOne({"address._id":addressId});
        if(!findAddress){
            return res.status(404).send("Address not found")
        }

        await Address.updateOne({
            "address._id":addressId

        },
        {
            $pull:{
                address:{
                    _id:addressId,
                }
            }
        }
    )
    res.redirect("/userProfile")

    } catch (error) {
        console.error("Error in deleting address",error);
        res.redirect("/pagenotfound")
        
    }
}

const changeProfilePic = async (req,res) => {
    try {
    const userId = req.session.user;
    const filename = req.file.filename;

    // Update user schema
    await User.findByIdAndUpdate(userId, {
      profileImage: filename
    });

    res.json({ success: true, filename });
    } catch (error) {
        console.error(err);
    res.status(500).json({ error: "Upload failed" });
    }
}

module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    userProfile,
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
    updateEmail,
    changePassword,
    changePasswordValid,
    verifyChangePassword,
    addAddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress,
    changeProfilePic,
    addaddress,
    postAddAddres
}