const PDFDocument = require("pdfkit");

function generateInvoice(order, res) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  res.setHeader("Content-Disposition", `attachment; filename=invoice-${order.orderId}.pdf`);
  res.setHeader("Content-Type", "application/pdf");

  doc.pipe(res); // Stream PDF directly to response

  doc.fontSize(20).text("INVOICE", { align: "center" });

  // Customer Info
  doc.moveDown().fontSize(12).text(`Customer: ${order.address.name}`);
  doc.text(`Phone: ${order.address.phone}`);
  doc.text(`Address: ${order.address.landMark}, ${order.address.city}, ${order.address.state}, ${order.address.pincode}`);

  // Order Details
  doc.moveDown().text(`Order ID: ${order.orderId}`);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);
  doc.text(`Payment Method: ${order.payment}`);
  doc.text(`Status: ${order.status}`);

  // Table Header
  doc.moveDown().font("Helvetica-Bold");
  doc.text("Product", 50, doc.y, { continued: true });
  doc.text("Qty", 250, doc.y, { continued: true });
  doc.text("Price", 300, doc.y, { continued: true });
  doc.text("Total", 400, doc.y);

  doc.font("Helvetica");
  order.product.forEach(item => {
    doc.text(item.name, 50, doc.y, { continued: true });
    doc.text(item.quantity.toString(), 250, doc.y, { continued: true });
    doc.text(`₹${item.price}`, 300, doc.y, { continued: true });
    doc.text(`₹${item.price * item.quantity}`, 400, doc.y);
  });

  // Total
  doc.moveDown().text(`Subtotal: ₹${order.totalPrice}`);
  doc.text(`Discount: ₹${order.discount}`);
  doc.font("Helvetica-Bold").text(`Total Paid: ₹${order.finalAmount}`);

  doc.end();
}

module.exports = generateInvoice;
