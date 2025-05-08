const User = require("../models/userSchema");

const userAuth = (req,res,next)=>{
    if(req.user.session){
        User.findById(req.session.user)
        .then(data=>{
            if(data && !data.isBlocked){
                next();
            }else{
                res.redirect("/login")
            }
        })
        .catch(error=>{
            console.log("Error in user auth middleware");
            res.status(500).send("Internal server error")
            
        })
    }else{
        res.redirect("/login")
    }
}

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