const mongoose = require("mongoose");
const {Schema} = mongoose;

const addressSchema = new Schema({
    userId: {
        type:Schema.Types.ObjectId,
        ref:"User",
        required : true
    },
    address:[{
        addressType:{
            type:String,
            required:true
        },
        name:{
            type:String,
            required:true
        },
        city:{
            type:String,
            required:true
        },
        landmark:{
            type:String,
            required:true
        },
        state:{
            type:String,
            required:true
        },
        pincode:{
            type:String,
            required:true
        },
        phone:{
            type:String,
            required:true
        },
        altPhone:{
            type:String,
            required:true
        }
    }]
})

const Address = mongoose.model("Address", addressSchema);
module.exports = Address;