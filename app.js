const dotenv = require("dotenv");
dotenv.config();

const express = require("express")
const app = express();
const path = require("path")
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo").default;
const connectDB = require("./config/db");
const session = require("express-session");
const passport = require("./config/passport");
const User = require("./models/userSchema");

const userRouter = require("./routes/userRouter")
const adminRouter = require("./routes/adminRouter")

const dbReady = connectDB();

app.set("trust proxy", 1);
app.set("view engine","ejs")
app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')])
app.use(express.static(path.join(__dirname,"public")));
app.use('/uploads', express.static('public/uploads'));

app.use(async (req, res, next) => {
    try {
        await dbReady;
        next();
    } catch (error) {
        console.error("Database unavailable");
        res.status(503).send("Database unavailable");
    }
});

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:false,
    proxy: true,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: "sessions"
    }),
    cookie:{
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 72*60*60*1000
    }
}))

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    const authPaths = [
        "/",
        "/login",
        "/signup",
        "/verify-otp",
        "/resend-otp",
        "/admin/login"
    ];

    if (authPaths.includes(req.path)) {
        const storeName = req.sessionStore && req.sessionStore.constructor
            ? req.sessionStore.constructor.name
            : "unknown";

        console.log("[session-debug]", {
            env: process.env.NODE_ENV || "undefined",
            path: req.path,
            method: req.method,
            secure: req.secure,
            hasSession: Boolean(req.session),
            hasSessionId: Boolean(req.sessionID),
            hasSessionUser: Boolean(req.session && req.session.user),
            hasSessionOtp: Boolean(req.session && req.session.userOtp),
            hasSessionUserData: Boolean(req.session && req.session.userData),
            hasCookieHeader: Boolean(req.headers.cookie),
            mongoReadyState: mongoose.connection.readyState,
            store: storeName
        });
    }

    next();
});

app.use(async (req, res, next) => {
    try {
        const sessionUser = (req.session && req.session.user) || req.user || null;
        if (!sessionUser) {
            res.locals.user = null;
            return next();
        }

        const userId = sessionUser._id || sessionUser;
        res.locals.user = await User.findById(userId);
        next();
    } catch (error) {
        next(error);
    }
  });

app.use((req,res,next)=>{
    res.set('cache-control','no-store')
    next();
});

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

module.exports = app
