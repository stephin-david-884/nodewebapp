const User = require("../models/userSchema");

const userAuth = (req, res, next) => {
    const userId = req.session?.user || req.user?._id;

    if (userId) {
        User.findById(userId)
            .then((data) => {
                if (data && !data.isBlocked) {
                    next();
                } else {
                    res.redirect("/login");
                }
            })
            .catch((error) => {
                console.log("Error in user auth middleware", error);
                res.status(500).send("Internal server error");
            });
    } else {
        res.redirect("/login");
    }
};


const adminAuth = (req, res, next) => {
    if (req.session.adminId) {
        User.findOne({ _id: req.session.adminId, isAdmin: true })
            .then((admin) => {
                if (admin) {
                    next();
                } else {
                    res.redirect("/admin/login");
                }
            })
            .catch((error) => {
                console.log("Error in adminAuth middleware", error);
                res.status(500).send("Internal server error");
            });
    } else {
        res.redirect("/admin/login");
    }
};



module.exports ={userAuth,adminAuth}