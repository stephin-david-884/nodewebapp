const mongoose = require("mongoose");
const { search } = require("../app");
const {Schema} = mongoose;
const generateReferralCode = require('../utils/generateReferralCode')

const userSchema = new Schema({
    name:{
        type:String,
        required : true,
    },
    email:{
        type: String,
        required : true,
        unique : true,
    },
    phone : {
        type: String,
        required : false,
        unique : false,
        sparse : true,
        default : null
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true,
        default: null
    },
      
    password:{
        type:String,
        required: false
    },
    isBlocked:{
        type: Boolean,
        default: false
    },
    isAdmin:{
        type: Boolean,
        default: false
    },
    cart: [{
    productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        default: 1
    },
    size: {
      type: String, 
      
    },
    }],

    wallet:{
        type:Number,
        default:0,
    },
    walletTransactions: [
    {
        date: Date,
        status: String, // e.g., "Added", "Refund", "Used for Order"
        amount: Number,
    }
    ],
    history: [
    {
        amount: Number,
        status: String, // 'credit' or 'debit'
        date: Date
    }
    ],
    wishlist:[{
        type: Schema.Types.ObjectId,
        ref:"Wishlist"
    }],
    orderHistory:[{
        type: Schema.Types.ObjectId,
        ref:"Order"
    }],
    profileImage: {
    type: String,
    default: '',
    },
    createdOn:{
        type: Date,
        default: Date.now,
    },
      referralCode: {
    type: String,
    unique: true,
    
    },
    referredBy: {
        type: String,
        default: null
    },
    redeemed:{
        type:Boolean,
        /*default:false*/
    },
    redeemedUsers: [{
        type: Schema.Types.ObjectId,
        ref:"User"
    }],
    searchHistory: [{
        category:{
            type: Schema.Types.ObjectId,
            ref:"Category",
        },
        brand:{
            type:String
        },
        searchOn:{
            type: Date,
            default: Date.now
        }
    }]
})

const User = mongoose.model("User", userSchema);
module.exports = User