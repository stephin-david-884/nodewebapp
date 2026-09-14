function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save((err) => {
            if (err) {
                console.error("session save error", err.message);
                return reject(err);
            }
            resolve();
        });
    });
}

module.exports = saveSession;
