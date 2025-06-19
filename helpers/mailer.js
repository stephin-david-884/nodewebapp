const nodemailer = require("nodemailer");
const env = require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "Gmail", // or "smtp.gmail.com"
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASSWORD,
  },
});

const sendOrderConfirmation = async (toEmail, order) => {
  const itemsHtml = order.product.map(
    item => `<li>${item.name} - Size: ${item.size}, Qty: ${item.quantity}, Price: ₹${item.price}</li>`
  ).join("");

  const html = `
    <h2>Hi,</h2>
    <p>Your order has been placed successfully!</p>
    <p><strong>Order ID:</strong> ${order._id}</p>
    <ul>${itemsHtml}</ul>
    <p><strong>Total:</strong> ₹${order.finalAmount}</p>
    <p>We’ll notify you when your items are shipped. Thank you for shopping with us!</p>
  `;

  await transporter.sendMail({
    from: `"Fluxo Store" <${process.env.NODEMAILER_EMAIL}>`,
    to: toEmail,
    subject: "Order Confirmation",
    html,
  });
};

const sendOrderCancellation = async (toEmail, product, orderId, refundAmount) => {
  const html = `
    <h2>Hi,</h2>
    <p>Your request to cancel the product <strong>${product.name}</strong> has been processed.</p>
    <p><strong>Order ID:</strong> ${orderId}</p>
    <p><strong>Cancelled Item:</strong> ${product.name} (Size: ${product.size})</p>
    <p><strong>Refunded Amount:</strong> ₹${refundAmount}</p>
    <p>The amount has been added to your wallet if applicable. Thank you!</p>
  `;

  await transporter.sendMail({
    from: `"Fluxo Store" <${process.env.NODEMAILER_EMAIL}>`,
    to: toEmail,
    subject: "Order Item Cancelled & Refunded",
    html,
  });
};


module.exports = { sendOrderConfirmation, sendOrderCancellation };
