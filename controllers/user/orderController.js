const User = require("../../models/userSchema")
const Product = require("../../models/productSchema")
 const Address = require("../../models/addressSchema")
 const Order = require("../../models/orderSchema")
 const Coupon = require("../../models/couponSchema")
 const mongodb = require("mongodb");
 const mongoose = require("mongoose");
 const fs = require("fs")
 const path = require("path")
const PDFDocument = require("pdfkit")
const generateInvoice = require("../../utils/invoiceGenerator")
require('pdfkit-table');
const env = require("dotenv").config();
const razorpay = require("razorpay");
const crypto = require("crypto");
const moment = require("moment");
const razorpayInstance = new razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});
const {sendOrderConfirmation, sendOrderCancellation} = require("../../helpers/mailer")


const generateOrderRazorpay = async (orderId, totalAmount) => {
  try {
    const razorpayOrder = await razorpayInstance.orders.create({
      amount: totalAmount * 100, // Razorpay expects amount in paise
      currency: "INR",
      receipt: `order_rcptid_${orderId}`,
      payment_capture: 1, // Auto-capture payment
    });
    return razorpayOrder;
  } catch (error) {
    console.error("Error generating Razorpay order:", error);
    throw error;
  }
};

const calculateCartTotal = async (userId) => {
  // First validate before converting
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID format");
  }

  const objectUserId = new mongoose.Types.ObjectId(userId);

  const grandTotal = await User.aggregate([
    { $match: { _id: objectUserId } },
    { $unwind: "$cart" },
    {
      $project: {
        proId: { $toObjectId: "$cart.productId" },
        quantity: "$cart.quantity",
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "proId",
        foreignField: "_id",
        as: "productDetails",
      },
    },
    { $unwind: "$productDetails" },
    {
      $group: {
        _id: null,
        totalPrice: {
          $sum: { $multiply: ["$quantity", "$productDetails.salePrice"] },
        },
      },
    },
  ]);

  return grandTotal.length > 0 ? grandTotal[0].totalPrice : 0;
};


const getCheckoutPage = async (req, res) => {
  try {
    const user = req.session.user._id;

    const findUser = await User.findOne({ _id: user });
    const addressData = await Address.findOne({ userId: user });
    if (!findUser || !findUser.cart || findUser.cart.length === 0) {
      return res.redirect("/shop");
    }
    const oid = new mongodb.ObjectId(user);
    const data = await User.aggregate([
      { $match: { _id: oid } },
      { $unwind: "$cart" },
      {
        $project: {
          proId: { $toObjectId: "$cart.productId" },
          quantity: "$cart.quantity",
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "proId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
    ]);

    const grandTotal = await User.aggregate([
      { $match: { _id: oid } },
      { $unwind: "$cart" },
      {
        $project: {
          proId: { $toObjectId: "$cart.productId" },
          quantity: "$cart.quantity",
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "proId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $unwind: "$productDetails", // Unwind the array created by the $lookup stage
      },

      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$quantity" },
          totalPrice: {
            $sum: { $multiply: ["$quantity", "$productDetails.salePrice"] },
          },
        },
      },
    ]);
    const gTotal = req.session.grandTotal;
    const today = new Date().toISOString();
    const totalPrice = grandTotal.length > 0 ? grandTotal[0].totalPrice : 0;
    const availableCoupons = await Coupon.find({
      $and: [
        { createdOn: { $lte: today } },
        { expireOn: { $gt: today } },
        { minimumPrice: { $lte: totalPrice } },
        {
          $or: [
            { isList: true },
            { userId: user }
          ]
        },
        { usedBy: { $ne: user } } // ✅ exclude already used by this user
      ]
    });
    console.log("User ID:", user);
console.log("Total Price:", totalPrice);
console.log("Available coupons:", availableCoupons.length);
availableCoupons.forEach(c => console.log(c.name));



    if (findUser.cart.length > 0) {
      res.render("checkoutcart", {
        product: data,
        user: findUser,
        isCart: true,
        userAddress: addressData,
        grandTotal: grandTotal[0].totalPrice,
        availableCoupons,
      });
    } else {
      res.redirect("/shop");
    }
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const deleteProduct = async (req, res) => {
  try {
    const id = req.query.id;
    const userId = req.session.user;
    const user = await User.findById(userId);
    const cartIndex = user.cart.findIndex((item) => item.productId == id);
    user.cart.splice(cartIndex, 1);
    await user.save();
    res.redirect("/checkout");
  } catch (error) {
    console.error(error);
    
    res.redirect("/pagenotfound");
  }
};

const orderPlaced = async (req, res) => {
  try {
    const { totalPrice, addressId, payment, discount } = req.body;
    const userId = req.session.user;

    const findUser = await User.findById(userId);
    if (!findUser) return res.status(404).json({ error: "User not found" });

    const findAddress = await Address.findOne({ userId: userId, "address._id": addressId });
    if (!findAddress) return res.status(404).json({ error: "Address not found" });

    const desiredAddress = findAddress.address.find(
      (item) => item._id.toString() === addressId.toString()
    );
    if (!desiredAddress) return res.status(404).json({ error: "Specific address not found" });

    // ✅ Load each product individually based on cart items to preserve size context
    const orderedProducts = await Promise.all(
      findUser.cart.map(async (cartItem) => {
        const product = await Product.findById(cartItem.productId);
        if (!product) throw new Error("Some product(s) not found");
        return {
          _id: product._id,
          price: product.salePrice,
          name: product.productName,
          image: product.productImage[0],
          productStatus: "Confirmed",
          quantity: cartItem.quantity,
          size: cartItem.size,
        };
      })
    );

    const cartItemQuantities = findUser.cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      size: item.size,
    }));

    if (payment === "cod" && totalPrice > 10000) {
      return res.status(400).json({
        error: "Orders above ₹10000 are not allowed for Cash on Delivery (COD)",
      });
    }

    const finalAmount = totalPrice - discount;

    // ✅ Wallet balance check
    if (payment === "wallet" && finalAmount > findUser.wallet) {
      return res.json({ payment: false, method: "wallet", success: false });
    }

    const newOrder = new Order({
      product: orderedProducts,
      totalPrice,
      discount,
      finalAmount,
      address: desiredAddress,
      payment,
      userId,
      status: payment === "razorpay" ? "Failed" : "Confirmed",
      createdOn: Date.now(),
    });

    const orderDone = await newOrder.save();

    try {
      await sendOrderConfirmation(findUser.email, orderDone);
    } catch (mailErr) {
      console.error("Order placed, but email failed:", mailErr);
    }

    // ✅ Mark coupon as used
    if (req.session.couponId) {
      await Coupon.updateOne(
        { _id: req.session.couponId },
        { $addToSet: { usedBy: userId } }
      );
      delete req.session.couponId;
    }

    // ✅ Update stock size-wise
    for (let orderedProduct of orderedProducts) {
      const product = await Product.findById(orderedProduct._id);
      const selectedSize = orderedProduct.size;

      if (product && selectedSize && product.sizes[selectedSize] !== undefined) {
        product.sizes[selectedSize] = Math.max(
          product.sizes[selectedSize] - orderedProduct.quantity,
          0
        );
        await product.save();
      }
    }

    // ✅ Clear cart
    await User.updateOne({ _id: userId }, { $set: { cart: [] } });

    // ✅ Payment handlers
    if (payment === "cod") {
      res.json({
        payment: true,
        method: "cod",
        order: orderDone,
        quantity: cartItemQuantities,
        orderId: orderDone._id,
      });
    } else if (payment === "wallet") {
      if (finalAmount <= findUser.wallet) {
        findUser.wallet -= finalAmount;
        findUser.history.push({
          amount: finalAmount,
          status: "debit",
          date: Date.now(),
        });
        await findUser.save();

        res.json({
          payment: true,
          method: "wallet",
          order: orderDone,
          quantity: cartItemQuantities,
          orderId: orderDone._id,
          success: true,
        });
      } else {
        await Order.updateOne(
          { _id: orderDone._id },
          { $set: { status: "Failed" } }
        );
        res.json({ payment: false, method: "wallet", success: false });
      }
    } else if (payment === "razorpay") {
      const razorPayGeneratedOrder = await generateOrderRazorpay(
        orderDone._id,
        orderDone.finalAmount
      );
      res.json({
        payment: false,
        method: "razorpay",
        razorPayOrder: razorPayGeneratedOrder,
        order: orderDone,
        quantity: cartItemQuantities,
      });
    }
  } catch (error) {
    console.error("Error processing order:", error);
    res.redirect("/pagenotfound");
  }
};


const getOrderDetailsPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.query.id;
    const findOrder = await Order.findOne({ _id: orderId });
    const findUser = await User.findOne({ _id: userId });
    
    let totalGrant = 0;
    findOrder.product.forEach((val) => {
      totalGrant += val.price * val.quantity;
    });

    const totalPrice = findOrder.totalPrice;
    const discount = findOrder.discount;
    const finalAmount = findOrder.finalAmount; 

    res.render("orderDetails", {
      orders: findOrder,
      user: findUser,
      totalGrant: totalGrant,
      totalPrice: totalPrice,
      discount: discount,
      finalAmount: finalAmount,
    });
  } catch (error) {
    res.redirect("/pagenotfound");
  }
};

const viewOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId);

    if (!order) return res.redirect('/profile');

    // Redirect to the detailed order page with query param
    res.redirect(`/orderDetails?id=${orderId}`);
  } catch (error) {
    console.error(error);
    res.redirect("/pagenotfound");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, productIndex } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!order.product || !order.product[productIndex]) {
      return res.status(400).json({ message: "Invalid product index" });
    }

    const orderItem = order.product[productIndex];

    if (orderItem.productStatus === "Cancel") {
      return res.status(400).json({ message: "Item already cancelled" });
    }

    const itemTotal = orderItem.price * orderItem.quantity;
    let refundAmount = itemTotal;

    // Apply proportional discount only if coupon discount exists
    if (order.discount > 0 && order.totalPrice > 0) {
      const proportionalDiscount = (itemTotal / order.totalPrice) * order.discount;
      refundAmount -= proportionalDiscount;
      refundAmount = Math.round(refundAmount); // Optional: round to nearest integer
    }

    // Refund logic for Razorpay or Wallet payments
    if ((order.payment === "razorpay" || order.payment === "wallet") && order.status === "Confirmed") {
      
      user.wallet += refundAmount;

      // Wallet history update
      user.history.push({
        amount: refundAmount,
        status: "credit",
        date: Date.now(),
        description: `Refund for cancelled product (${orderItem.name}) in order ${order._id}`,
      });

      await user.save();
    }

    // Update product status to Cancel
   order.product[productIndex].productStatus = "Cancel";

    // Step 1: Recalculate new total (non-cancelled items)
    let newTotal = 0;
    order.product.forEach(p => {
      if (p.productStatus !== "Cancel") {
        newTotal += p.price * p.quantity;
      }
    });

    order.totalPrice = newTotal;

    // Step 2: Recalculate proportional coupon discount
    let newDiscount = 0;
    if (order.discount > 0) {
      // Calculate based on original total before any cancellations
      const originalTotal = order.product.reduce((sum, p) => {
        return sum + (p.price * p.quantity);
      }, 0);

      newDiscount = Math.round((newTotal / originalTotal) * order.discount);
    }

    order.discount = newDiscount;

    // Step 3: Update final amount
    order.finalAmount = newTotal - newDiscount;


    // Update order.status if needed
    const allCancelled = order.product.every(p => p.productStatus === "Cancel");
    if (allCancelled) {
      order.status = "Cancelled";
    } 

    await order.save();


    // Update product stock
const product = await Product.findById(orderItem._id);

if (product) {
  const size = orderItem.size; // 'S', 'M', or 'L'
  
  if (product.sizes[size] !== undefined) {
    product.sizes[size] += orderItem.quantity;
    await product.save();
  } else {
    console.warn(`Size ${size} not found for product ${product._id}`);
  }
}

try {
  await sendOrderCancellation(user.email, orderItem, order._id, refundAmount);
} catch (emailErr) {
  console.error("Cancellation email failed:", emailErr);
}


res.status(200).json({ message: "Product item cancelled successfully" });

  } catch (error) {
    console.error("Cancel item error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


const getInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).send('Order not found');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // Header
    doc.fontSize(24).text("FLUXO", { align: 'center' });
    doc.fontSize(12).text("www.fluxo.com", { align: 'center' });
    doc.moveDown();
    doc.fontSize(20).text("INVOICE", { align: 'center' });
    doc.moveDown(2);

    // Order details
    doc.fontSize(12).text(`Order ID: ${order.orderId}`);
    doc.text(`Date: ${new Date(order.createdOn).toLocaleDateString()}`);
    doc.text(`Customer: ${order.address.name}`);
    doc.text(`Phone: ${order.address.phone}`);
    doc.text(`Address: ${order.address.landMark}, ${order.address.city}, ${order.address.state} - ${order.address.pincode}`);
    doc.moveDown();

    // Table Headers
    const startX = 50;
    let startY = doc.y;
    const rowHeight = 20;

    const cols = [
      { label: 'Item', width: 200 },
      { label: 'Qty', width: 50 },
      { label: 'Price', width: 100 },
      { label: 'Total', width: 100 },
    ];

    // Header background
    doc.rect(startX, startY, cols.reduce((sum, col) => sum + col.width, 0), rowHeight).fill('#eee').stroke();
    doc.fillColor('#000');

    let x = startX;
    cols.forEach(col => {
      doc.text(col.label, x + 5, startY + 5);
      x += col.width;
    });

    startY += rowHeight;

    // Table Rows
    order.product.forEach((item, index) => {
      let x = startX;
      const rowY = startY + index * rowHeight;

      doc.rect(startX, rowY, cols.reduce((sum, col) => sum + col.width, 0), rowHeight).stroke();

      doc.text(item.name, x + 5, rowY + 5, { width: cols[0].width - 10 });
      x += cols[0].width;

      doc.text(item.quantity, x + 5, rowY + 5);
      x += cols[1].width;

      doc.text(`${item.price}`, x + 5, rowY + 5);
      x += cols[2].width;

      doc.text(`Rs.${item.quantity * item.price}`, x + 5, rowY + 5);
    });

    startY += order.product.length * rowHeight + 20;

    // Totals
    doc.moveTo(startX, startY).moveDown();
    doc.fontSize(12).text(`Subtotal: Rs.${order.totalPrice}`);
    doc.text(`Discount: Rs.${order.discount}`);
    doc.text(`Final Amount: Rs.${order.finalAmount}`);
    doc.text(`Payment Method: ${order.payment}`);
    doc.text(`Order Status: ${order.status}`);
    doc.moveDown(2);
    doc.fontSize(12).text('Thank you for shopping with us!', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating invoice');
  }
};


const verifyPayment = async (req, res) => {
  try {
    const { order, payment } = req.body;


    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(order.id + "|" + payment.razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    const orderId = order.receipt.split("_")[2]; // Extract your actual DB _id

     

    if (generatedSignature === payment.razorpay_signature) {

      
      // ✅ Payment successful
      const paidOrder = await Order.findById(orderId);
      if (paidOrder) {
        paidOrder.status = "Confirmed";
        paidOrder.product.forEach(item => {
          item.productStatus = "Confirmed";
        });
        await paidOrder.save();
      }
      res.json({ status: true });
    } else {

      // ❌ Payment failed
      const failedOrder = await Order.findById(orderId);
      if (failedOrder) {
        failedOrder.status = "Failed";
        failedOrder.product.forEach(item => {
          item.productStatus = "Failed";
        });
        await failedOrder.save();
      }
      res.json({ status: false });
    }
  } catch (err) {
    console.error("Payment verification error:", err);
    res.json({ status: false });
  }
};


const paymentConfirm = async (req, res) => {
  try {
    const orderId = req.body.orderId;
    const updated = await Order.updateOne(
      { _id: orderId },
      { $set: { status: "Confirmed" } }
    );

    if (updated.modifiedCount === 1) {
      res.json({ status: true });
    } else {
      res.json({ status: false, message: "Order not updated" });
    }
  } catch (error) {
    console.error("Error in paymentConfirm:", error);
    res.status(500).json({ status: false, error: "Internal Server Error" });
  }
};


const applyCoupon = async (req, res) => {
  const { code } = req.body;
  const userId = req.session.user._id;

  try {
    // 👉 Find coupon that is either public OR private but assigned to this user
    const coupon = await Coupon.findOne({
      name: code,
      $or: [
        { isList: true },
        { isList: false, userId: userId }  // private coupon for specific user
      ]
    });

    if (!coupon) {
      return res.json({ success: false, message: 'Invalid coupon code.' });
    }

    if (coupon.expireOn < new Date()) {
      return res.json({ success: false, message: 'Coupon has expired.' });
    }

    if (coupon.usedBy.some(id => id.toString() === userId.toString())) {
  return res.json({ success: false, message: 'You have already used this coupon.' });
}


 


    const cartTotal = await calculateCartTotal(userId);

    if (cartTotal < coupon.minimumPrice) {
      return res.json({ success: false, message: `Minimum order ₹${coupon.minimumPrice} required.` });
    }

    req.session.couponId = coupon._id;

    return res.json({ success: true, discount: coupon.offerPrice, couponId: coupon._id });

  } catch (error) {
    console.error('Coupon error:', error);
    return res.json({ success: false, message: 'Something went wrong.' });
  }
};

const removeCoupon = (req, res) => {
  try {
    delete req.session.couponId;
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res.status(500).json({ success: false });
  }
};


const returnRequest = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { productId, size, reason, productIndex } = req.body;

    // Match the specific product in the product array by productId and size
    const order = await Order.findOne({ _id: orderId });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const productItem = order.product[productIndex];

    if (
      productItem &&
      productItem._id.toString() === productId &&
      productItem.size === size
    ) {
      productItem.productStatus = 'Return Requested';
      productItem.returnReason = reason;
      
    } else {
      return res.status(404).json({ success: false, message: "Product not found in order" });
    }

    await order.save();

    res.status(200).json({ success: true, message: "Return request submitted" });
  } catch (err) {
    console.error("Return request error:", err);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const retryPayment = async (req, res) => {
  try {
    const orderId = req.query.id;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status !== "Failed") {
      return res.status(400).json({ error: "Order is not failed" });
    }

    const razorPayOrder = await generateOrderRazorpay(orderId, order.finalAmount);

    res.json({
      razorPayOrder,
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Retry payment error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};




 module.exports = {getCheckoutPage, deleteProduct, orderPlaced, getOrderDetailsPage, viewOrderDetails, cancelOrder,getInvoice, verifyPayment, paymentConfirm, applyCoupon, returnRequest, retryPayment, removeCoupon}