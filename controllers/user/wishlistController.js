const User = require("../../models/userSchema")
const Product = require("../../models/productSchema")

const loadWishlist = async (req,res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);
        const products = await Product.find({_id:{$in:user.wishlist}}).populate('category');

        res.render("wishlist",{
            user,
            wishlist:products,
        })
    } catch (error) {
        console.error(error);
        res.redirect("/pagenotfound")
        
    }
}

const addToWishlist = async (req,res) => {
    try {
        const productId = req.body.productId;
        const userId = req.session.user;
        const user = await User.findById(userId);
        if(user.wishlist.includes(productId)){
            return res.status(200).json({status:false, message:"Product already in wishlist"})
        }
        user.wishlist.push(productId);
        await user.save();
        return res.status(200).json({status:true, message:'Product added to wishlist'})
    } catch (error) {
        console.error(error);
        return res.status(500).json({status:false, message:'Server Error'})
    }
}

const removeProduct = async (req,res) => {
    try {
        const productId = req.query.productId;
        const userId = req.session.user;
        const user = await User.findById(userId);
        const index = user.wishlist.indexOf(productId);
        user.wishlist.splice(index,1);
        await user.save();
        return res.redirect("/wishlist")
    } catch (error) {
        console.error(error);
        return res.status(500).json({status:false, message:'Server Error'})
    }
}

const addToCartWish = async (req, res) => {
  try {
    const { productId, size, quantity } = req.body;
    const userId = req.session.user;

    // Basic validation
    if (!productId || !size || !quantity) {
      return res.status(400).json({ status: false, message: "Missing data" });
    }

    const qty = parseInt(quantity);
    if (qty < 1 || qty > 3) {
      return res.status(400).json({ status: false, message: "Quantity must be between 1 and 3" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ status: false, message: "Product not found" });
    }

    // Check if selected size has enough stock
    const availableQty = product.sizes?.[size];
    if (!availableQty || availableQty < qty) {
      return res.status(400).json({ status: false, message: "Insufficient stock for selected size" });
    }

    const user = await User.findById(userId);

    // Check if product already exists in cart with same size
    const existingItem = user.cart.find(
      (item) => item.productId.toString() === productId && item.size === size
    );

    if (existingItem) {
      const newQty = existingItem.quantity + qty;
      if (newQty > 3) {
        return res.status(400).json({ status: false, message: "Maximum quantity (3) exceeded" });
      }
      existingItem.quantity = newQty;
    } else {
      user.cart.push({ productId, quantity: qty, size });
    }

    // Remove product from wishlist
    user.wishlist.pull(productId);

    await user.save();

    return res.status(200).json({
      status: true,
      message: "Added to cart and removed from wishlist",
      cartLength: user.cart.length,
    });

  } catch (error) {
    console.error("Error in addToCartWish:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

module.exports = {loadWishlist, addToWishlist, removeProduct, addToCartWish}