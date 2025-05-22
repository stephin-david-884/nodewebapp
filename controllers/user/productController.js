const User = require("../../models/userSchema")
const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema")
const Brand = require("../../models/brandSchema")

const productDetails = async (req,res) => {
    try {
        
        const userId = req.session.user;
        const userData = await User.findById(userId)
        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category');
        const findCategory = product.category;
        const categoryOffer = findCategory ?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        if (product.regularPrice && product.salePrice && product.regularPrice > product.salePrice) {
            totalOffer = Math.round(((product.regularPrice - product.salePrice) / product.regularPrice) * 100);
        }

        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: product._id } // exclude current product
        }).limit(10); // optional limit

        res.render("product-details",{
            user:userData,
            product:product,
            quantity:product.quantity,
            totalOffer:totalOffer,
            category:findCategory,
            relatedProducts
        });


    } catch (error) {
        console.error("Error for fetching product details",error);
        res.redirect("/pagenotfound")
        
    }
}

module.exports = {productDetails}