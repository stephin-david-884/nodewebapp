const express = require("express")
const app = express();
const path = require("path")
const MongoStore = require("connect-mongo");
const dotenv = require("dotenv");
const db = require("./config/db");
const session = require("express-session");
const passport = require("./config/passport");

const userRouter = require("./routes/userRouter")
const adminRouter = require("./routes/adminRouter")

dotenv.config();
db()

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: "sessions"
    }),
    cookie:{
        secure:process.env.NODE_ENV === "production",
        httpOnly:true,
        maxAge:72*60*60*1000
    }
}))


  

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    res.locals.user = req.session.user || req.user || null;
    next();
  });

app.use((req,res,next)=>{
    res.set('cache-control','no-store')
    next();
});

app.set("view engine","ejs")
app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')])
app.use(express.static(path.join(__dirname,"public")));
app.use('/uploads', express.static('public/uploads'));


app.use("/",userRouter)
app.use("/admin",adminRouter);

// 404 Page Not Found Handler (for all unmatched routes)
app.use((req, res, next) => {
  res.status(404).render('pageNotFound'); 
});

if (require.main === module) {
    app.listen(process.env.PORT || 3000, () => {
        console.log("Server is running");
    });
}
// app.listen(process.env.PORT,()=>{
//     console.log("Server is  running")
// })

module.exports = app