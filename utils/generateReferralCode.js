
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase(); // Example: "X8Z2LKMN"
}
module.exports = generateReferralCode;
