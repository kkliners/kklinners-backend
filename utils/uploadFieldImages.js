const multer = require("multer");
const cloudinary = require("./cloudinary");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

const uploadFieldReportImages = upload.array("images", 6);

const bufferToCloudinary = (buffer, folder = "fieldReports", mimetype = "image/jpeg") =>
  new Promise((resolve, reject) => {
    const publicId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const isPdf = mimetype === "application/pdf";
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: isPdf ? "raw" : "image",
        ...(isPdf ? { format: "pdf" } : {}),
      },
      (err, result) => (err ? reject(err) : resolve(result?.secure_url || result?.url))
    );
    stream.end(buffer);
  });

async function uploadBuffers(files = [], folder = "fieldReports") {
  const urls = [];
  for (const file of files) {
    if (file?.buffer) {
      urls.push(await bufferToCloudinary(file.buffer, folder, file.mimetype));
    }
  }
  return urls;
}

/** Single file (employee ID photo or PDF document). Returns { url, mimeType }. */
async function uploadOneFile(file, folder = "employeeDocs") {
  if (!file?.buffer) throw new Error("Missing file");
  const mimeType = file.mimetype || "image/jpeg";
  const url = await bufferToCloudinary(file.buffer, folder, mimeType);
  return { url, mimeType };
}

module.exports = { uploadFieldReportImages, uploadBuffers, uploadOneFile };
