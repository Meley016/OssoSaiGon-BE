// src/utils/cloudinaryHelper.js
const cloudinary = require("cloudinary").v2;
const fetch = require("node-fetch");
const stream = require("stream");

const uploadImageFromURL = async (url, folder) => {
  try {
    if (!url) {
      console.log("No URL provided for upload"); // Debug
      return null;
    }
    console.log("Fetching image from URL:", url); // Debug
    const response = await fetch(url, { timeout: 10000 }); // Thêm timeout
    if (!response.ok) {
      console.log(`Failed to fetch image: ${url}, status: ${response.status}`); // Debug
      return null;
    }

    const buffer = await response.buffer();
    console.log(`Image fetched, size: ${buffer.length} bytes`); // Debug
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "image" },
        (error, result) => {
          if (error) {
            console.error(`Cloudinary upload error for ${url}:`, error.message); // Debug
            reject(error);
          } else {
            console.log(`Uploaded to Cloudinary: ${result.secure_url}`); // Debug
            resolve(result);
          }
        }
      );
      stream.Readable.from(buffer).pipe(uploadStream);
    });
    return result.secure_url;
  } catch (err) {
    console.error(`Upload from URL failed: ${url}, error: ${err.message}`); // Debug
    return null;
  }
};

module.exports = { uploadImageFromURL };