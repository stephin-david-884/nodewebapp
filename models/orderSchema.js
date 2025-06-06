const mongoose = require("mongoose");
const {Schema} = mongoose;
const {v4:uuidv4} = require('uuid');

const orderSchema = new Schema({
    orderId:{
        type:String,
        default:()=>uuidv4(),
        unique:true
    },
    userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    },
    product: [
        {
        _id: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        name: String,
        price: Number,
        image: String,
        quantity: Number,
        size: {
        type: String,
        enum: ['S', 'M', 'L'],
        required: true
        },

        productStatus: {
            type: String,
            default: "Confirmed",
        },
        },
    ],
    totalPrice:{
        type:Number,
        required:true
    },
    discount:{
        type:Number,
        default:0
    },
    finalAmount:{
        type:Number,
        required:true
    },
    address:{
        /*type:Schema.Types.ObjectId,
        ref:"User",
        required:true*/
        type: Object, // storing entire address object instead of ref
        required: true,
    },
    invoiceDate:{
        type:Date
    },
    status:{
        type:String,
        required:true,
        enum:['Pending','Processing','Shipped','Delivered','Cancelled','Return Request','Returned','Confirmed','Failed','Rejected','Partially Cancelled']
    },
    createdOn:{
        type:Date,
        default:Date.now,
        required:true
    },
    couponApplied:{
        type:Boolean,
        default:false
    },
     payment: {
    type: String,
    enum: ["cod", "wallet", "razorpay"],
    default: "cod",
    },
    returnReason: {
    type: String,
    default: ''
    },


})

const Order = mongoose.model("Order",orderSchema);
module.exports = Order;
