const Brand = require("../../models/brandSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema")
const fs = require("fs")
const path = require("path")
const sharp = require("sharp");


const getProductAddPage = async (req,res) => {
    try {
        
        const category = await Category.find({isListed:true});
        const brand = await Brand.find({isBlocked:false});
        res.render("product-add",{
            cat:category,
            brand:brand
        });

    } catch (error) {
        res.redirect("/pageerror")
    }
}

const addProducts = async (req, res) => {
    try {
      const { productName, description, brand, category, regularPrice, salePrice, quantity, color, processor, graphicsCard, storages, display, operatingSystem, boxContains } = req.body;
      
    
      const productExists = await Product.findOne({ productName });
      if (productExists) {
        return res.status(400).json({ success: false, message: "Product already exists, try another name" });
      }
  
     
      const uploadDir = path.join(__dirname, "../../public/uploads/product-images");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
  
     
      const imageFilenames = [];
  
      
      for (let i = 1; i <= 4; i++) {
        const croppedImageData = req.body[`croppedImage${i}`];
      
        if (croppedImageData && croppedImageData.startsWith('data:image')) {
          const base64Data = croppedImageData.replace(/^data:image\/\w+;base64,/, '');
          const imageBuffer = Buffer.from(base64Data, 'base64');
      
          const filename = Date.now() + "-" + `cropped-image-${i}` + ".webp";
          const filepath = path.join(uploadDir, filename);
      
          await sharp(imageBuffer)
            .webp({ quality: 80 })
            .toFile(filepath);
      
          imageFilenames.push(`uploads/product-images/${filename}`);
        }
      }
      
  
     
      if (imageFilenames.length < 4) {
        return res.status(400).json({ success: false, message: "Please upload all 4 product images" });
      }
  
      
      const foundCategory = await Category.findOne({ name: category });
      if (!foundCategory) {
        return res.status(400).json({ success: false, message: "Category not found" });
      }
  
      
      const newProduct = new Product({
        productName,
        description,
        
        brand,
        category:foundCategory._id, 
        regularPrice,
        salePrice,
        createdOn:new Date(),
        quantity,
        sizes: {
          S: quantity,
          M: quantity,
          L: quantity
        },
        color,
        
        productImage: imageFilenames,
        status: "Available",
      });
  
      await newProduct.save();
      return res.status(200).json({ success: true, message: "Product added successfully" });
    } catch (error) {
      console.error("Error saving product:", error);
      return res.status(500).json({ success: false, message: "Error saving product" });
    }
  };

const getAllProducts =async (req,res) => {
    try {
        
        const search = req.query.search || "";
        const page = req.query.page || 1;
        const limit = 4;
        const productData = await Product.find({
            $or:[
                {productName:{$regex:new RegExp(".*"+search+".*","i")}},
                {brand:{$regex:new RegExp(".*"+search+".*","i")}},
            ],
        })
        .limit(limit*1)
        .skip((page-1)*limit)
        .populate('category')
        .exec();

        const count = await Product.find({
            $or:[
                {productName:{$regex:new RegExp(".*"+search+".*","i")}},
                {brand:{$regex:new RegExp(".*"+search+".*","i")}},
            ],
        }).countDocuments();

        const category = await Category.find({isListed:true});
        const brand = await Brand.find({isBlocked:false});

        if(category && brand){
            res.render("products",{
                data:productData,
                currentPage:page,
                totalPages:Math.ceil(count/limit),
                cat:category,
                brand:brand,
            })
        }else{
            res.render("page-404")
        }


    } catch (error) {
        res.redirect("/pageerror")
    }
}

const addProductOffer = async (req,res) => {
    try {
        const {productId,percentage} = req.body;
        const findProduct = await Product.findOne({_id:productId});
        const findCategory = await Category.findOne({_id:findProduct.category});
        if(findCategory.categoryOffer > percentage){
            return res.json({status:false, message:"This products category already has a category offer"})
        }

        findProduct.salePrice = findProduct.salePrice - Math.floor(findProduct.regularPrice*(percentage/100))
        findProduct.productOffer = parseInt(percentage);
        await findProduct.save();
        findCategory.categoryOffer=0;
        await findCategory.save();
        res.json({status:true})


    } catch (error) {
        res.redirect("/pageerror");
        res.status(500).json({status:false,message:"Internal Server Error"})
    }
}

const removeProductOffer = async (req,res) => {
    try {
        
        const {productId} = req.body;
        const findProduct = await Product.findOne({_id:productId});
        const percentage = findProduct.productOffer;
        findProduct.salePrice = findProduct.salePrice + Math.floor(findProduct.regularPrice*(percentage/100))
        findProduct.productOffer = 0;
        await findProduct.save();
        res.json({status:true})
    } catch (error) {
        res.redirect("/pageerror")
    }
}

const unblockProduct = async (req,res) => {
    try {
        
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect("/admin/products");

    } catch (error) {
        res.redirect("/pagerror")
    }
}

const blockProduct = async (req,res) => {
    try {
        
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect("/admin/products");

    } catch (error) {
        res.redirect("/pagerror")
    }
}

const getEditProduct = async (req, res) => {
    try {
      const id = req.query.id
      const product = await Product.findOne({ _id: id }).populate("category")
      const categories = await Category.find({})
      const brand = await Brand.find({isBlocked:false});
  
      if (!product) {
        return res.status(404).send("Product not found")
      }
  
      res.render("edit-product", {
        product: product,
        brand:brand,
        cat: categories,
      })
    } catch (error) {
      console.error("Error in getEditProduct:", error)
      res.redirect("/pageerror")
    }
  }
  
  const editProduct = async (req, res) => {
    try {
      const id = req.params.id
      const {
        productName,
        description,
        
        regularPrice,
        salePrice,
        quantity,
        color,
        brand,       
        category,
      } = req.body
  
      const existingProduct = await Product.findOne({
        productName: productName,
        _id: { $ne: id },
      })
  
      if (existingProduct) {
        return res
          .status(400)
          .json({ success: false, message: "Product with this name already exists. Please try another name." })
      }
  
      const updateFields = {
        productName,
        description,
        regularPrice,
        salePrice,
        quantity,
        color,
        brand,
        category,
      }
  
      const product = await Product.findById(id)
      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found" })
      }
  
      
      for (let i = 1; i <= 4; i++) {
        const croppedImageData = req.body[`croppedImage${i}`];
        
        if (croppedImageData && croppedImageData.startsWith('data:image')) {
          
          const base64Data = croppedImageData.replace(/^data:image\/\w+;base64,/, '');
          const imageBuffer = Buffer.from(base64Data, 'base64');
          
         
          const filename = Date.now() + "-" + `cropped-image-${i}` + ".webp";
          const filepath = path.join(__dirname, "../../public/uploads/product-images", filename);
  
        
          await sharp(imageBuffer)
            .webp({ quality: 80 })
            .toFile(filepath);
  
          const imagePath = `uploads/product-images/${filename}`;
  
          
          if (product.productImage[i - 1]) {
            product.productImage[i - 1] = imagePath;
          } else {
            product.productImage.push(imagePath);
          }
        } else if (req.files && req.files[`image${i}`]) {
          
          const file = req.files[`image${i}`][0];
          const filename = Date.now() + "-" + file.originalname.replace(/\s/g, "") + ".webp";
          const filepath = path.join(__dirname, "../../public/uploads/product-images", filename);
  
          await sharp(file.buffer)
            .resize(800, 800, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(filepath);
  
          const imagePath = `uploads/product-images/${filename}`;
  
          if (product.productImage[i - 1]) {
            product.productImage[i - 1] = imagePath;
          } else {
            product.productImage.push(imagePath);
          }
        }
      }
  
      Object.assign(product, updateFields);
      
      await product.save();
  
      res.json({ success: true, message: "Product updated successfully" });
    } catch (error) {
      console.error("Error in editProduct:", error);
      res.status(500).json({ success: false, message: "An error occurred while updating the product" });
    }
  };
  
  
  
  const deleteSingleImage = async (req, res) => {
    try {
      const { imageNameToServer, productIdToServer, imageIndex } = req.body;
      const product = await Product.findById(productIdToServer);
  
      if (!product) {
        return res.status(404).json({ status: false, message: "Product not found" });
      }
  
      
      product.productImage.splice(imageIndex, 1);
      await product.save();
  
      const imagePath = path.join(__dirname, "../../public", imageNameToServer);
  
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log(`Image ${imageNameToServer} deleted successfully`);
      } else {
        console.log(`Image ${imageNameToServer} not found`);
      }
  
      res.json({ status: true, message: "Image deleted successfully" });
    } catch (error) {
      console.error("Error in deleteSingleImage:", error);
      res.status(500).json({ status: false, message: "An error occurred while deleting the image" });
    }
  };

module.exports = {getProductAddPage, addProducts, getAllProducts, addProductOffer, 
    removeProductOffer, blockProduct, unblockProduct, getEditProduct, editProduct, deleteSingleImage}