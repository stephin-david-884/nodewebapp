const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const mongodb = require("mongodb");


const getCartPage = async (req, res) => {
  try {
    
    const id = req.session.user?._id;
    const user = await User.findOne({ _id: id });
    const productIds = user.cart.map((item) => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    const oid = new mongodb.ObjectId(id);
    let data = await User.aggregate([
      { $match: { _id: oid } },
      { $unwind: "$cart" },
      {
        $project: {
          proId: { $toObjectId: "$cart.productId" },
          quantity: "$cart.quantity",
          size: "$cart.size",
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
    let quantity = 0;
    for (const i of user.cart) {
      quantity += i.quantity;
    }
    let grandTotal = 0;
    for (let i = 0; i < data.length; i++) {
      if (products[i]) {
        grandTotal += data[i].productDetails[0].salePrice * data[i].quantity;
      }
      req.session.grandTotal = grandTotal;
    }
    res.render("cart", {
      user,
      quantity,
      data,
      grandTotal,
    });
  } catch (error) {
    console.error(error);
    
    res.redirect("/pageNotFound");
  }
};
const addToCart = async (req, res) => {
  try {
    const id = req.body.productId;
    const userId = req.session.user?._id;
    const selectedQuantity = parseInt(req.body.quantity) || 1;
     const selectedSize = req.body.size;

    if (!selectedSize) {
      return res.json({ status: false, message: "Size is required" });
    }

    const findUser = await User.findById(userId);
    const product = await Product.findById({ _id: id }).lean();

    if (!product) {
      return res.json({ status: "Product not found" });
    }

    if (product.quantity <= 0) {
      return res.json({ status: "Out of stock" });
    }

    const cartIndex = findUser.cart.findIndex((item) => item.productId == id && item.size === selectedSize);

    if (cartIndex === -1) {
      // New product to cart
      const quantityToAdd = Math.min(selectedQuantity, 3, product.quantity); // ✅ max 3
      await User.findByIdAndUpdate(userId, {
        $addToSet: {
          cart: {
            productId: id,
            quantity: quantityToAdd,
            size: selectedSize,
          },
        },
      });
      return res.json({ status: true, cartLength: findUser.cart.length + 1, user: userId });
    } else {
      // Already in cart
      const productInCart = findUser.cart[cartIndex];
      const totalDesiredQuantity = productInCart.quantity + selectedQuantity;

      if (totalDesiredQuantity > 3) {
        return res.json({ status: false, message: "Maximum 3 units per product allowed" }); // ✅ show warning
      }

      if (totalDesiredQuantity <= product.quantity) {
        await User.updateOne(
          { _id: userId, "cart.productId": id, "cart.size": selectedSize },
          { $set: { "cart.$.quantity": totalDesiredQuantity } }
        );
        return res.json({ status: true, cartLength: findUser.cart.length, user: userId });
      } else {
        return res.json({ status: false, message: "Not enough stock available" });
      }
    }
  } catch (error) {
    console.error(error);
    return res.redirect("/pageNotFound");
  }
};


const changeQuantity = async (req, res) => {
  try {
    const id = req.body.productId;
    const user = req.session.user?._id;
    const count = parseInt(req.body.count);

    const findUser = await User.findOne({ _id: user });
    const findProduct = await Product.findOne({ _id: id });
    const oid = new mongodb.ObjectId(user);

    if (!findUser || !findProduct) {
      return res.json({ status: false, error: "User or product not found." });
    }

    // ✅ Fix: convert ObjectId to string for comparison
    const productInCart = findUser.cart.find(item => item.productId.toString() === id);

    if (!productInCart) {
      return res.json({ status: false, error: "Product not found in cart." });
    }

    const newQuantity = productInCart.quantity + count;

    if (newQuantity < 1) {
      return res.json({ status: false, error: "Quantity cannot be less than 1." });
    }

    if (count === 1 && newQuantity > findProduct.quantity) {
      return res.json({ status: false, error: "Product is out of stock." });
    }

    await User.updateOne(
      { _id: user, "cart.productId": id },
      { $set: { "cart.$.quantity": newQuantity } }
    );

    const grandTotal = await User.aggregate([
      { $match: { _id: oid } },
      { $unwind: "$cart" },
      {
        $project: {
          proId: { $toObjectId: "$cart.productId" },
          quantity: "$cart.quantity"
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "proId",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: "$productDetails" },
      {
        $group: {
          _id: null,
          totalPrice: {
            $sum: { $multiply: ["$quantity", "$productDetails.salePrice"] }
          }
        }
      }
    ]);

    res.json({
      status: true,
      quantityInput: newQuantity,
      count: count,
      totalAmount: newQuantity * findProduct.salePrice,
      grandTotal: grandTotal[0]?.totalPrice || 0
    });

  } catch (error) {
    console.error("changeQuantity error:", error);
    res.status(500).json({ status: false, error: "Server error occurred." });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { productId, size } = req.body;
    const userId = req.session.user._id;

    const user = await User.findById(userId);

    // ✅ Normalize size to null if not provided
    const inputSize = size || null;

    // ✅ Improved filter logic: remove item matching both productId and size (handles undefined/null size)
    user.cart = user.cart.filter(item => {
      const itemProductId = item.productId.toString();
      const itemSize = item.size || null;
      return !(itemProductId === productId && itemSize === inputSize);
    });

    await user.save();

    // ✅ Recalculate grand total with updated cart
    const populatedUser = await User.findById(userId).populate("cart.productId");
    const grandTotal = populatedUser.cart.reduce((total, item) => {
      const price = item.productId?.salePrice || 0;
      return total + price * item.quantity;
    }, 0);

    // ✅ Send updated grandTotal to frontend
    res.json({ status: true, grandTotal });

  } catch (error) {
    console.error("Error deleting product:", error);
    res.json({ status: false });
  }
};



const updateCartSize = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId, currentSize, newSize } = req.body;

    const user = await User.findById(userId);

    const item = user.cart.find(item =>
      item.productId.toString() === productId &&
      item.size === currentSize
    );

    if (item) {
      item.size = newSize;
      await user.save();
      return res.json({ status: true });
    } else {
      return res.json({ status: false, message: 'Item not found in cart.' });
    }
  } catch (err) {
    console.error(err);
    res.json({ status: false, message: 'Server error' });
  }
};







module.exports = { getCartPage,addToCart,changeQuantity,deleteProduct, updateCartSize}