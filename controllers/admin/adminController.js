const User = require("../../models/userSchema")
const mongoose = require("mongoose")
const bcrypt = require("bcrypt")
const Order = require("../../models/orderSchema")
const Product = require("../../models/productSchema")
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const pageerror = async (req,res) => {
    res.render("admin-error")    
}

const loadLogin = (req,res) => {
    
    if(req.session.admin){
        return res.redirect("/admin/dashboard")
    }
    res.render("admin-login",{message:null})
}

const login = async (req,res) => {
    try {
        
        const {email,password} = req.body;
        const admin = await User.findOne({email,isAdmin:true});
        if(admin){
            const passwordMatch = bcrypt.compare(password,admin.password)
            if(passwordMatch){
                req.session.admin=true;
                req.session.adminId = admin._id;
                return res.redirect("/admin")
            }else{
                return res.redirect("/admin/login")
            }
        }else{
            return res.redirect("/admin/login")
        }

    } catch (error) {
        console.log("login error",error);
        return res.redirect("/pageerror")
    }
}

const loadDashboard = async (req,res) => {
    if(req.session.admin){
        try {
            
            res.render("dashboard")

        } catch (error) {
            res.redirect("/pageerror")
        }
    }
    
}

const logout = async (req,res) => {
    try {
        
        req.session.destroy(err=>{
            if(err){
                console.log("Error destroying session",err);
                return res.redirect("/pageerror")
                
            }
            res.redirect("/admin/login")
        })
    } catch (error) {
        console.log("Unexpected error during logout",error);
        res.redirect("/pageerror")
        
    }
}

const getDashboardSummary = async (req, res) => {
  const today = new Date();
  const from = new Date();
  from.setDate(today.getDate() - 6); // Last 7 days

  const orders = await Order.find({
    createdOn: { $gte: from },
    status: { $ne: "Cancelled" }
  }).populate('userId'); // ✅ Correct field for population

  const dailySales = Array(7).fill(0);
  const labels = Array(7).fill().map((_, i) => {
    const date = new Date();
    date.setDate(today.getDate() - 6 + i);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  });

  orders.forEach(order => {
    const dayIndex = Math.floor((new Date(order.createdOn) - from) / (1000 * 60 * 60 * 24));
    if (dayIndex >= 0 && dayIndex < 7) {
      dailySales[dayIndex] += order.finalAmount;
    }
  });

  const totalAmount = orders.reduce((sum, o) => sum + o.totalPrice, 0);
  const totalDiscount = orders.reduce((sum, o) => sum + o.discount, 0);
  const totalOrders = orders.length;

  // ✅ Correct user field reference
  const tableOrders = orders.map(order => ({
    id: order._id.toString(),
    user: order.userId?.name || 'Guest',
    date: order.createdOn,
    total: order.totalPrice,
    couponDiscount: order.couponDiscount || 0,
    productDiscount: order.discount || 0,
    final: order.finalAmount,
    payment: order.payment?.method || 'Unknown'
  }));

  res.json({
    totalAmount,
    totalDiscount,
    totalOrders,
    sales: dailySales,
    labels,
    orders: tableOrders
  });
};


const downloadSalesReport = async (req, res) => {
  try {
    const { format, range, startDate, endDate } = req.query;

    let start = new Date();
    let end = new Date();

    if (range === 'daily') {
      start.setHours(0, 0, 0, 0);
    } else if (range === 'weekly') {
      start.setDate(start.getDate() - 7);
    } else if (range === 'monthly') {
      start.setMonth(start.getMonth() - 1);
    } else if (range === 'yearly') {
      start.setFullYear(start.getFullYear() - 1);
    } else if (range === 'custom' && startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    }

    const orders = await Order.find({
      createdOn: { $gte: start, $lte: end },
      status: { $ne: 'Cancelled' }
    })
    .populate('userId')
    .populate('product._id'); // <-- This fixes the missing regularPrice issue

    const summary = {
      totalOrders: orders.length,
      totalPrice: 0,
      discount: 0,
      productDiscount: 0,
      finalAmount: 0,
    };

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
      res.setHeader('Content-Type', 'application/pdf');
      doc.pipe(res);

      doc.fontSize(20).text('Sales Report', { align: 'center' });
      doc.moveDown();

      const tableTop = 100;
      const itemX = 30;
      const headers = ['#', 'Order ID', 'User', 'Date', 'Total', 'Coupon Disc', 'Prod Disc', 'Final', 'Payment'];
      const colWidths = [20, 80, 80, 70, 60, 60, 60, 60, 70];

      let rowY = tableTop;

      // Headers
      headers.forEach((header, i) => {
        const x = itemX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.rect(x, rowY, colWidths[i], 20).stroke();
        doc.font('Helvetica-Bold').fontSize(9).text(header, x + 2, rowY + 5);
      });

      rowY += 20;

      orders.forEach((order, index) => {
        const totalRegularPrice = order.product.reduce((sum, item) =>
          sum + ((item._id?.regularPrice || 0) * item.quantity), 0);

        const productLevelDiscount = order.product.reduce((sum, item) =>
          sum + (((item._id?.regularPrice || 0) - item.price) * item.quantity), 0);

        summary.totalPrice += totalRegularPrice;
        summary.discount += order.discount;
        summary.productDiscount += productLevelDiscount;
        summary.finalAmount += order.finalAmount;

        const row = [
          index + 1,
          order._id.toString().slice(-8),
          order.userId?.name || 'N/A',
          new Date(order.createdOn).toLocaleDateString(),
          `Rs.${totalRegularPrice}`,
          `Rs.${order.discount}`,
          `Rs.${productLevelDiscount}`,
          `Rs.${order.finalAmount}`,
          order.payment
        ];

        row.forEach((text, i) => {
          const x = itemX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
          doc.rect(x, rowY, colWidths[i], 20).stroke();
          doc.font('Helvetica').fontSize(8).text(text, x + 2, rowY + 5);
        });

        rowY += 20;
        if (rowY > 750) {
          doc.addPage();
          rowY = 50;
        }
      });

      rowY += 20;
      doc.fontSize(12).text('Order Summary', itemX, rowY);
      rowY += 15;

      const summaryData = [
        ['Total Orders', summary.totalOrders],
        ['Total Price', `Rs.${summary.totalPrice}`],
        ['Coupon Discounts', `Rs.${summary.discount}`],
        ['Product Discounts', `Rs.${summary.productDiscount}`],
        ['Final Amount', `Rs.${summary.finalAmount}`]
      ];

      summaryData.forEach(([label, value]) => {
        doc.rect(itemX, rowY, 200, 20).stroke();
        doc.rect(itemX + 200, rowY, 200, 20).stroke();
        doc.fontSize(9).text(label, itemX + 5, rowY + 5);
        doc.text(value, itemX + 205, rowY + 5);
        rowY += 20;
      });

      doc.end();

    } else if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      worksheet.columns = [
        { header: '#', key: 'index', width: 5 },
        { header: 'Order ID', key: 'id', width: 20 },
        { header: 'User', key: 'user', width: 20 },
        { header: 'Date', key: 'date', width: 20 },
        { header: 'Total Price', key: 'total', width: 15 },
        { header: 'Coupon Discount', key: 'couponDiscount', width: 18 },
        { header: 'Product Discount', key: 'productDiscount', width: 18 },
        { header: 'Final Amount', key: 'final', width: 15 },
        { header: 'Payment', key: 'payment', width: 15 },
      ];

      orders.forEach((order, index) => {
        const totalRegularPrice = order.product.reduce((sum, item) =>
          sum + ((item._id?.regularPrice || 0) * item.quantity), 0);

        const productLevelDiscount = order.product.reduce((sum, item) =>
          sum + (((item._id?.regularPrice || 0) - item.price) * item.quantity), 0);

        summary.totalPrice += totalRegularPrice;
        summary.discount += order.discount;
        summary.productDiscount += productLevelDiscount;
        summary.finalAmount += order.finalAmount;

        const row = worksheet.addRow({
          index: index + 1,
          id: order._id.toString(),
          user: order.userId?.name || 'N/A',
          date: new Date(order.createdOn).toLocaleString(),
          total: totalRegularPrice,
          couponDiscount: order.discount,
          productDiscount: productLevelDiscount,
          final: order.finalAmount,
          payment: order.payment,
        });

        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      worksheet.addRow([]);
      worksheet.addRow(['Order Summary']);
      const summaryRows = [
        ['Total Orders', summary.totalOrders],
        ['Total Price', summary.totalPrice],
        ['Coupon Discounts', summary.discount],
        ['Product Discounts', summary.productDiscount],
        ['Final Amount', summary.finalAmount],
      ];

      summaryRows.forEach(data => {
        const row = worksheet.addRow(data);
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      await workbook.xlsx.write(res);
      res.end();

    } else {
      return res.status(400).send('Invalid format');
    }

  } catch (err) {
    console.error('Download Error:', err);
    res.status(500).send('Internal Server Error');
  }
};

const getFilteredSalesReportTable = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.body;

    let start, end;
    const now = new Date();

    switch (range) {
      case 'daily':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
      case 'weekly':
        const dayOfWeek = now.getDay();
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - dayOfWeek));
        break;
      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'yearly':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear() + 1, 0, 1);
        break;
      case 'custom':
        start = startDate ? new Date(startDate) : new Date('1970-01-01');
        end = endDate ? new Date(endDate) : new Date();
        end.setDate(end.getDate() + 1); // Include full end date
        break;
      default:
        return res.json({ orders: [] });
    }

    // Fetch orders with user and product details, sorted by latest first
    const orders = await Order.find({
      createdOn: { $gte: start, $lt: end }
    })
      .sort({ createdOn: -1 }) // latest first
      .populate('userId', 'name')
      .populate('product._id') // to access product prices
      .lean();

    const formattedOrders = orders.map(order => {
      let productDiscount = 0;

        // Loop through products and calculate product discount
        if (Array.isArray(order.product)) {
          order.product.forEach(item => {
            const product = item._id; // Populated Product
            const quantity = item.quantity || 1;
            if (product && product.regularPrice && product.salePrice) {
              const discount = (product.regularPrice - product.salePrice) * quantity;
              productDiscount += discount;
            }
          });
        }

         const totalRegularPrice = order.product.reduce((sum, item) =>
          sum + ((item._id?.regularPrice || 0) * item.quantity), 0);

      return {
        id: order.orderId || order._id.toString(),
        user: order.userId?.name || 'Guest',
        date: order.createdOn,
        total: totalRegularPrice || 0,
        couponDiscount: order.discount || 0,
        productDiscount: Math.round(productDiscount), // Round if needed
        final: order.finalAmount || order.totalPrice || 0,
        payment: order.payment || 'N/A'
      };
    });

    res.json({ orders: formattedOrders });
  } catch (error) {
    console.error('Error fetching filtered sales report:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const loadSalesReport = async (req,res) => {
    if(req.session.admin){
        try {
            
            res.render("salesReport")

        } catch (error) {
            res.redirect("/admin/pageerror")
        }
    }
    
}





module.exports = {loadLogin, login,loadDashboard,pageerror,logout,getDashboardSummary,downloadSalesReport,getFilteredSalesReportTable, loadSalesReport}