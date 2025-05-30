const User = require("../../models/userSchema")
const Product = require("../../models/productSchema")
const razorpay = require("razorpay");

const instance = new razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create Razorpay order
const addMoneyToWallet = async (req, res) => {
  try {
    const amount = req.body.amount;
    const options = {
      amount: amount * 100, // in paisa
      currency: "INR",
      receipt: "wallet_rcpt_" + Date.now(),
    };

    instance.orders.create(options, function (err, order) {
      if (err) {
        console.log("Error while creating Razorpay order:", err);
        return res.status(500).json({ success: false });
      }
      res.json({ orderId: order.id, amount: order.amount });
    });
  } catch (error) {
    console.error("Add Money Error:", error);
    res.redirect("/pagenotfound");
  }
};

// Verify payment and update wallet
const verify_payment = async (req, res) => {
  try {
    const { payment, orderId, amount } = req.body;
    const userId = req.session.user;

    // OPTIONAL: You can also verify signature using crypto if needed (for full security)

    await User.updateOne(
      { _id: userId },
      {
        $inc: { wallet: amount },
        $push: {
          history: {
            amount: amount,
            status: "credit",
            date: new Date(),
          },
        },
      }
    );

    res.json({ status: true });
  } catch (error) {
    console.error("Verify Wallet Payment Error:", error);
    res.status(500).redirect("/pageNotFound");
  }
};


module.exports = {addMoneyToWallet, verify_payment}