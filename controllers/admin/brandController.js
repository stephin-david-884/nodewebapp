const Brand = require("../../models/brandSchema");
const Product = require("../../models/productSchema");
const { uploadToCloudinary } = require("../../config/cloudinary");

const getBrandPage = async (req,res) => {
    try {
        
        const page =parseInt(req.query.page) || 1;
        const limit =4;
        const skip =(page-1)*limit;

        const brandData = await Brand.find({})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalBrands = await Brand.countDocuments();
        const totalPages = Math.ceil(totalBrands/limit);
        const reverseBrand = brandData.reverse();
        res.render("brands",{
            data:reverseBrand,
            currentPage:page,
            totalPages:totalPages,
            totalBrands:totalBrands,
            error: req.query.error || undefined
        })

    } catch (error) {
        res.redirect("/pageerror")
    }
}

const addBrand = async (req, res) => {
  try {
    const brand = req.body.name.trim();

    const findBrand = await Brand.findOne({
      brandName: { $regex: new RegExp(`^${brand}$`, 'i') }
    });

    if (findBrand) {
      return res.redirect("/admin/brands?error=Brand already exists");
    }

    if (!req.file || !req.file.buffer) {
      return res.redirect("/admin/brands?error=Brand logo is required");
    }

    const cloudinaryResult = await uploadToCloudinary(req.file.buffer, "brands");
    const imageUrl = cloudinaryResult.secure_url;

    const newBrand = new Brand({
      brandName: brand,
      brandImage: [imageUrl],
    });

    await newBrand.save();
    res.redirect("/admin/brands");

  } catch (error) {
    console.error("Error adding brand:", error);
    res.redirect("/pageerror");
  }
};



const blockBrand = async (req,res) => {
    try {
        const id = req.query.id;
        await Brand.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect("/admin/brands")
    } catch (error) {
        res.redirect("/pageerror");
    }
}

const unBlockBrand = async (req,res) => {
    try {
        const id = req.query.id;
        await Brand.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect("/admin/brands")
    } catch (error) {
        res.redirect("/pageerror");
    }
}

const deleteBrand = async (req,res) => {
    try {
        const {id} = req.query
        if(!id){
            return res.status(400).redirect("/pageerror")
        }
        await Brand.deleteOne({_id:id});
        res.redirect("/admin/brands")
    } catch (error) {
        console.error("Error deleting brand",error);
        res.status(500).redirect("/pageerror")
    }
}

module.exports = {getBrandPage, addBrand, blockBrand, unBlockBrand, deleteBrand}