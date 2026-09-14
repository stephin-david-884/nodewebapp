function getSessionUserId(req) {
    const user = req.session && req.session.user;
    if (!user) return null;
    return user._id || user;
}

module.exports = getSessionUserId;
