const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload file buffer directly to Cloudinary
 * @param {Buffer} buffer 
 * @param {string} folder 
 * @returns {Promise<object>}
 */
const uploadToCloudinary = (buffer, folder = "uploads") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
};

/**
 * Upload Base64 data stringto Cloudinary
 * @param {string} base64Data 
 * @param {string} folder 
 * @returns {Promise<object>}
 */
const uploadBase64ToCloudinary = (base64Data, folder = "uploads") => {
  return cloudinary.uploader.upload(base64Data, {
    folder: folder,
  });
};

/**
 * Delete image from Cloudinary by public ID or Cloudinary URL
 * @param {string} publicIdOrUrl 
 * @returns {Promise<object>}
 */
const deleteFromCloudinary = async (publicIdOrUrl) => {
  if (!publicIdOrUrl || typeof publicIdOrUrl !== "string") return;
  try {
    let publicId = publicIdOrUrl;
    if (publicIdOrUrl.startsWith("http")) {
      const parts = publicIdOrUrl.split("/");
      const filenameWithExt = parts.pop();
      const filename = filenameWithExt.substring(0, filenameWithExt.lastIndexOf(".")) || filenameWithExt;
      const uploadIdx = parts.indexOf("upload");
      if (uploadIdx !== -1) {
        const folderParts = parts.slice(uploadIdx + 1).filter(p => !p.startsWith("v"));
        publicId = folderParts.length ? `${folderParts.join("/")}/${filename}` : filename;
      } else {
        publicId = filename;
      }
    }
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Error deleting image from Cloudinary:", error);
  }
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  uploadBase64ToCloudinary,
  deleteFromCloudinary,
};
