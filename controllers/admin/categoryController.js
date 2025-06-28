const { name } = require("ejs");
const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema")

const categoryInfo = async (req,res) => {
    try {
        
        const page =parseInt(req.query.page) || 1;
        const limit =4;
        const skip =(page-1)*limit;

        const categoryData = await Category.find({})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories/limit);
        res.render("category",{
            cat:categoryData,
            currentPage:page,
            totalPages: totalPages,
            totalCategories: totalCategories
        })

    } catch (error) {
        console.error(error);
        res.redirect("/pageerror")
        
    }
}

const addCategory = async (req,res) => {
    
    try {
        const name = req.body.name.trim()
        const description = req.body.description
        const existingCategory = await Category.findOne({name:{$regex: new RegExp(`^${name}$`,'i')}});
        if(existingCategory){
            return res.status(400).json({error:"Category already exists"})
        }
        const newCategory = new Category({
            name,
            description,
        })
        await newCategory.save();
        return res.json({message:"Category added successfully"})

    } catch (error) {
        return res.status(500).json({error:"Internal Server Error"})
    }
}

const addCategoryOffer = async (req, res) => {
  try {
    const percentage = parseInt(req.body.percentage);
    const categoryId = req.body.categoryId;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    // ✅ Update category offer
    category.categoryOffer = percentage;
    await category.save();

    const products = await Product.find({ category: category._id });

    // ✅ For each product, apply the maximum of productOffer or categoryOffer
    for (const product of products) {
      const effectiveOffer = Math.max(product.productOffer || 0, percentage);
      product.salePrice = product.regularPrice - Math.floor(product.regularPrice * (effectiveOffer / 100));
      await product.save();
    }

    return res.json({ status: true });
  } catch (error) {
    console.error("Error in addCategoryOffer:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};


const removeCategoryOffer = async (req, res) => {
  try {
    const categoryId = req.body.categoryId;
    const category = await Category.findById(categoryId);

    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    const products = await Product.find({ category: category._id });

    for (const product of products) {
      const offer = product.productOffer || 0;
      if (offer > 0) {
        product.salePrice = product.regularPrice - Math.floor(product.regularPrice * (offer / 100));
      } else {
        product.salePrice = product.regularPrice;
      }
      await product.save();
    }

    category.categoryOffer = 0;
    await category.save();

    res.json({ status: true });
  } catch (error) {
    console.error("Error in removeCategoryOffer:", error);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

const getListCategory = async (req,res) => {
    try {
        let id = req.query.id
        await Category.updateOne({_id:id},{$set:{isListed:false}})
        res.redirect("/admin/category")
    } catch (error) {
        res.redirect("/pageerror")
    }
}

const getUnlistCategory = async (req,res) => {
    try {
        let id = req.query.id
        await Category.updateOne({_id:id},{$set:{isListed:true}})
        res.redirect("/admin/category")
    } catch (error) {
        res.redirect("/pageerror")
    }
}

const getEditCategory = async (req, res) => {
  try {
    const id = req.query.id;

    const category = await Category.findById(id);

    const error = req.query.error || null;

    res.render("edit-category", {
      category,
      error
    });
  } catch (error) {
    console.error("Error in getEditCategory:", error);
    res.redirect("/pageerror");
  }
};


const editCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const { categoryName, description } = req.body;

    // Case-insensitive match, excluding current category
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${categoryName}$`, 'i') },
      _id: { $ne: id }
    });

    if (existingCategory) {
      return res.redirect(`/admin/editCategory?id=${id}&error=Category name already exists`);
    }

    const updateCategory = await Category.findByIdAndUpdate(id, {
      name: categoryName,
      description: description,
    }, { new: true });

    if (updateCategory) {
      res.redirect("/admin/category");
    } else {
      res.status(404).send("Category not found");
    }

  } catch (error) {
    console.error("Error in editCategory:", error);
    res.status(500).send("Internal Server Error");
  }
};



module.exports = {categoryInfo, addCategory, addCategoryOffer, removeCategoryOffer, getListCategory,getUnlistCategory,getEditCategory,editCategory}