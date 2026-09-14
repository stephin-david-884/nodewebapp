const mongoose = require("mongoose")
const env = require("dotenv").config();

const connectDB = async()=>{
    try {
        if (mongoose.connection.readyState === 1) {
            return;
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log("DB Connected");
        
    } catch (error) {
        console.log("DB Connection error",error.message);
        throw error;
    }
}

module.exports = connectDB;
