const express = require("express")
const router = express.Router();
const adminController = require("../controllers/admin/adminController")
const {userAuth,adminAuth} = require("../middlewares/auth")
const customerController = require("../controllers/admin/customerController")
const categoryController = require("../controllers/admin/categoryController")
const brandController = require("../controllers/admin/brandController")
const productController = require("../controllers/admin/productController")
const bannerController = require("../controllers/admin/bannerController")
const couponController = require("../controllers/admin/couponController")
const orderController = require("../controllers/admin/orderController")
const multer = require("multer");
const storage = require("../helpers/multer");
const uploads = multer({storage:storage});


router.get("/pageerror", adminController.pageerror);
//Login management
router.get("/login",adminController.loadLogin)
router.post("/login",adminController.login)
router.get("/",adminAuth,adminController.loadDashboard);
router.get("/logout", adminController.logout)

//Customer management
router.get("/users", adminAuth,customerController.customerInfo)
router.get("/blockCustomer",adminAuth,customerController.customerBlocked);
router.get("/unblockCustomer",adminAuth,customerController.customerunBlocked);

//Category management
router.get("/category", adminAuth, categoryController.categoryInfo);
router.post("/addCategory", adminAuth, categoryController.addCategory);
router.post("/addCategoryOffer", adminAuth, categoryController.addCategoryOffer);
router.post("/removeCategoryOffer", adminAuth, categoryController.removeCategoryOffer);
router.get("/listCategory", adminAuth, categoryController.getListCategory);
router.get("/unlistCategory", adminAuth, categoryController.getUnlistCategory);
router.get("/editCategory", adminAuth, categoryController.getEditCategory);
router.get("/edit-category/:id", adminAuth, categoryController.getEditCategory);

router.post("/editCategory/:id", adminAuth, categoryController.editCategory);


//Brand Management
router.get("/brands", adminAuth, brandController.getBrandPage);
router.post("/addBrand",adminAuth,uploads.single("image"), brandController.addBrand);
router.get("/blockBrand", adminAuth, brandController.blockBrand);
router.get("/unBlockBrand", adminAuth, brandController.unBlockBrand);
router.get("/deleteBrand", adminAuth, brandController.deleteBrand);


//Product Management
router.get("/addProducts", adminAuth, productController.getProductAddPage);
router.post("/addProducts", 
    adminAuth, 
    uploads.fields([
      { name: 'image1', maxCount: 1 },
      { name: 'image2', maxCount: 1 },
      { name: 'image3', maxCount: 1 },
      { name: 'image4', maxCount: 1 }
    ]), 
    productController.addProducts
  );
router.get("/products", adminAuth, productController.getAllProducts) 
router.post("/addProductOffer", adminAuth,productController.addProductOffer)
router.post("/removeProductOffer", adminAuth,productController.removeProductOffer)
router.get("/blockProduct", adminAuth, productController.blockProduct)
router.get("/unblockProduct", adminAuth, productController.unblockProduct)

router.get("/editProduct",adminAuth,productController.getEditProduct)
router.post("/editProduct/:id", adminAuth, uploads.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 }
]), productController.editProduct);
router.post("/deleteImage",adminAuth,productController.deleteSingleImage)

//Banner Management
router.get("/banner", adminAuth, bannerController.getBannerPage)
router.get("/addBanner", adminAuth, bannerController.getAddBannerPage)
router.post("/addBanner", adminAuth, uploads.single("images"), bannerController.addBanner)
router.get("/deleteBanner", adminAuth, bannerController.deleteBanner)

//Coupon Management
router.get("/coupon", adminAuth, couponController.loadCoupon)
router.post("/createCoupon", adminAuth, couponController.createCoupon);
router.get("/editCoupon", adminAuth, couponController.editCoupon)
router.post("/updateCoupon", adminAuth, couponController.updateCoupon)
router.get("/deletecoupon", adminAuth, couponController.deleteCoupon)

//Order Management
router.get("/orderList", adminAuth, orderController.listOrders)
router.get("/order/:orderId", adminAuth, orderController.getOrderDetails)
router.get('/invoice/:orderId', adminAuth, orderController.getInvoice);
router.post('/order/:orderId/status', adminAuth, orderController.updateOrderStatus);
router.post('/approveReturn/:orderId/:productIndex', adminAuth, orderController.approveReturn);
router.post('/rejectReturn/:orderId/:productIndex', adminAuth, orderController.rejectReturn);

//Dashboard Management and Sales Report
router.get('/sales-summary',adminAuth, adminController.getDashboardSummary);
router.get('/download-sales-report',adminAuth, adminController.downloadSalesReport);
router.post('/filter-sales-table',adminAuth, adminController.getFilteredSalesReportTable);
router.get('/sales-report', adminAuth, adminController.loadSalesReport)


module.exports = router