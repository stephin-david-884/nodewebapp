const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const mongodb = require("mongodb");
const mongoose = require('mongoose')
const env = require("dotenv").config();
const Coupon=require("../../models/couponSchema");
const { v4: uuidv4 } = require('uuid');
const fs = require("fs")
 const path = require("path")
const PDFDocument = require("pdfkit")
require('pdfkit-table');


const listOrders = async (req, res) => {
  try {
    const perPage = 6;
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search ? req.query.search.trim() : '';

    const match = {};

    if (search) {
      match.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
        { 'user.name': { $regex: search, $options: 'i' } }
      ];
    }

    const pipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'userId', // ✅ correct field
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      ...(search ? [{ $match: match }] : []), // only if search is present
      { $sort: { createdOn: -1 } },
      { $skip: perPage * (page - 1) },
      { $limit: perPage },
      {
        $project: {
          orderId: 1,
          createdOn: 1,
          status: 1,
          finalAmount: 1,
          'user.name': 1,
          'user.email': 1,
          'user.phone': 1
        }
      }
    ];

    const orders = await Order.aggregate(pipeline);

    const countPipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      ...(search ? [{ $match: match }] : []),
      { $count: 'total' }
    ];

    const countResult = await Order.aggregate(countPipeline);
    const totalOrders = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalOrders / perPage);

    res.render('order-list', {
      orders,
      currentPage: page,
      totalPages,
      search
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.redirect("/pageerror");
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
      .populate('userId', 'name email phone');

    if (!order) {
      return res.status(404).send('Order not found');
    }

    res.render('orderDetail', { order });
  } catch (err) {
    console.error('Error fetching order details:', err);
    res.redirect("/pageerror");
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
    res.redirect("/pageerror");
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const newStatus = req.body.status;

    // Define the order of statuses
    const ORDER_STATUS_FLOW = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

    // Find the order without updating yet
    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).send('Order not found');
    }

    const currentIndex = ORDER_STATUS_FLOW.indexOf(order.status);
    const newIndex = ORDER_STATUS_FLOW.indexOf(newStatus);

    // Prevent moving to an earlier status (unless same status)
     if (newIndex === -1 || newIndex < currentIndex) {
      return res.status(400).send('Invalid status transition');
    }

    // Update the order status
    order.status = newStatus;
    await order.save();

    res.redirect(`/admin/order/${orderId}`); // Redirect to order details page
  } catch (error) {
    console.error('Error updating order status:', error);
    res.redirect("/pageerror");
  }
};


const approveReturn = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    // Fetch the order
    const order = await Order.findOne({orderId:orderId}); 
    
    if (!order) {
      return res.status(404).send('Order not found');
    }

    // Validate return status
    if (order.status !== 'Return Request') {
      return res.status(400).send('Invalid return request');
    }

    // Get refund amount (ensure it's a number)
    const refundAmount = Number(order.totalPrice);
    if (isNaN(refundAmount)) {
      return res.status(400).send('Invalid refund amount');
    }

    // Fetch user
    const user = await User.findById(order.userId);
    if (!user) {
      return res.status(404).send('User not found');
    }

    // Refund to wallet
    user.wallet = Number(user.wallet || 0) + refundAmount;
    user.history.push({
    amount: refundAmount,
    status: "credit",
    date: new Date()
  });
    await user.save();

       // 🔁 Increment product quantities back
    for (const item of order.product) {
      const product = await Product.findById(item._id);
      if (product) {
        product.quantity += item.quantity;
        await product.save();
      }
    }

    // Update order status
    order.status = 'Returned';
    await order.save();

   res.redirect(`/admin/order/${orderId}`);

  } catch (error) {
    console.error('Error in approveReturn:', error);
    res.redirect("/pagerror")
  }
};

const rejectReturn = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    // Find the order by orderId (not _id)
    const order = await Order.findOne({ orderId: orderId });

    if (!order) {
      return res.status(404).send('Order not found');
    }

    // Only allow rejection if it's in "Return Request" status
    if (order.status !== 'Return Request') {
      return res.status(400).send('Return request cannot be rejected');
    }

    // Update order status
    order.status = 'Rejected';
    await order.save();

    res.redirect(`/admin/order/${orderId}`);
  } catch (error) {
    console.error('Error in rejectReturn:', error);
    res.status(500).send('Something went wrong');
  }
};


module.exports = {listOrders, getOrderDetails, getInvoice, updateOrderStatus, approveReturn, rejectReturn}