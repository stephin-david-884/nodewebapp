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
  });

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

  res.json({ totalAmount, totalDiscount, totalOrders, sales: dailySales, labels });
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
    });

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
      res.setHeader('Content-Type', 'application/pdf');
      doc.pipe(res);

      doc.fontSize(20).text('Sales Report', { align: 'center' });
      doc.moveDown();

      // Table Header
      const tableTop = 100;
      const itemX = 50;
      const headers = ['#', 'Order ID', 'Date', 'Total', 'Discount', 'Final', 'Payment'];
      const colWidths = [30, 90, 100, 60, 60, 60, 80];

      headers.forEach((header, i) => {
        doc.font('Helvetica-Bold').fontSize(10).text(header, itemX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), tableTop);
      });

      // Table Rows
      let rowY = tableTop + 20;
      orders.forEach((order, index) => {
        const row = [
          index + 1,
          order._id.toString().slice(-8),
          new Date(order.createdOn).toLocaleDateString(),
          `Rs.${order.totalPrice}`,
          `Rs.${order.discount}`,
          `Rs.${order.finalAmount}`,
          order.payment
        ];

        row.forEach((text, i) => {
          doc.font('Helvetica').fontSize(9).text(text, itemX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), rowY);
        });

        rowY += 20;

        // Add new page if needed
        if (rowY > 750) {
          doc.addPage();
          rowY = 50;
        }
      });

      doc.end();

    } else if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      worksheet.columns = [
        { header: 'Order ID', key: 'id' },
        { header: 'Date', key: 'date' },
        { header: 'Total Price', key: 'total' },
        { header: 'Discount', key: 'discount' },
        { header: 'Final Amount', key: 'final' },
        { header: 'Payment Method', key: 'payment' }
      ];

      orders.forEach(order => {
        worksheet.addRow({
          id: order._id.toString(),
          date: new Date(order.createdOn).toLocaleString(),
          total: order.totalPrice,
          discount: order.discount,
          final: order.finalAmount,
          payment: order.payment
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



module.exports = {loadLogin, login,loadDashboard,pageerror,logout,getDashboardSummary,downloadSalesReport}