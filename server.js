const express = require("express");
const AkaveIPCClient = require("./index");
const multer = require("multer");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");
const cors = require("cors");
const logger = require("./logger");

dotenv.config();

// Initialize express app
const app = express();

// Configure CORS
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Middleware to parse JSON bodies
app.use(express.json());

// Configure multer for file upload handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "file1", maxCount: 1 },
]);

// Initialize Akave IPC client
const client = new AkaveIPCClient(
  process.env.NODE_ADDRESS,
  process.env.PRIVATE_KEY
);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Bucket endpoints
app.post("/buckets", async (req, res) => {
  try {
    const { bucketName } = req.body;
    const result = await client.createBucket(bucketName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/buckets", async (req, res) => {
  try {
    const result = await client.listBuckets();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/buckets/:bucketName", async (req, res) => {
  try {
    const result = await client.viewBucket(req.params.bucketName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/buckets/:bucketName", async (req, res) => {
  try {
    const result = await client.deleteBucket(req.params.bucketName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// File endpoints
app.get("/buckets/:bucketName/files", async (req, res) => {
  try {
    const result = await client.listFiles(req.params.bucketName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/buckets/:bucketName/files/:fileName", async (req, res) => {
  try {
    const result = await client.getFileInfo(
      req.params.bucketName,
      req.params.fileName
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Modified file upload endpoint
app.post("/buckets/:bucketName/files", upload, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  try {
    logger.info(requestId, "Processing file upload request", {
      bucket: req.params.bucketName,
    });

    let result;
    const uploadedFile = req.files?.file?.[0] || req.files?.file1?.[0];

    if (uploadedFile) {
      logger.info(requestId, "Handling buffer upload", {
        filename: uploadedFile.originalname,
      });
      // Handle buffer upload
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "akave-"));
      // Sanitize filename by replacing spaces and special chars with underscore
      const sanitizedFileName = normalizeFileName(uploadedFile.originalname);
      const tempFilePath = path.join(tempDir, sanitizedFileName);
      try {
        // Write buffer to temporary file
        await fs.writeFile(tempFilePath, uploadedFile.buffer);

        // Upload the temporary file
        result = await client.uploadFile(req.params.bucketName, tempFilePath, {
          fileName: uploadedFile.originalname,
          cleanup: true, // Tell client to cleanup temp file
        });
      } finally {
        // Cleanup temp directory
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    } else if (req.body.filePath) {
      logger.info(requestId, "Handling file path upload", {
        path: req.body.filePath,
      });
      // Handle file path upload
      result = await client.uploadFile(
        req.params.bucketName,
        req.body.filePath
      );
    } else {
      throw new Error("No file or filePath provided");
    }

    logger.info(requestId, "File upload completed", { result });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(requestId, "File upload failed", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/buckets/:bucketName/files/:fileName/download", async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  try {
    logger.info(requestId, "Processing download request", {
      bucket: req.params.bucketName,
      file: req.params.fileName,
    });

    // Create downloads directory if it doesn't exist
    const downloadDir = path.join(process.cwd(), "downloads");
    await fs.mkdir(downloadDir, { recursive: true });

    const normalizedFileName = normalizeFileName(req.params.fileName);
    const destinationPath = path.join(downloadDir, normalizedFileName);

    // Download the file
    await client.downloadFile(
      req.params.bucketName,
      req.params.fileName,
      downloadDir
    );

    // Check if file exists and is readable
    try {
      await fs.access(destinationPath, fsSync.constants.R_OK);
    } catch (err) {
      throw new Error("File download failed or file is not readable");
    }

    // Get file stats
    const stats = await fs.stat(destinationPath);

    // Add Accept-Ranges header
    res.setHeader("Accept-Ranges", "bytes");

    // Set common headers
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${req.params.fileName}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");

    let fileStream;
    const range = req.headers.range;

    if (range) {
      // Validate range format first
      if (!range.startsWith("bytes=") || !range.includes("-")) {
        // Invalid range format - fall back to full file
        res.setHeader("Content-Length", stats.size);
        fileStream = fsSync.createReadStream(destinationPath);
      } else {
        try {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

          if (
            isNaN(start) ||
            isNaN(end) ||
            start >= stats.size ||
            end >= stats.size ||
            start > end
          ) {
            return res.status(416).json({
              success: false,
              error: "Requested range not satisfiable",
            });
          }

          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${stats.size}`);
          res.setHeader("Content-Length", end - start + 1);
          fileStream = fsSync.createReadStream(destinationPath, { start, end });
        } catch (rangeError) {
          // Any parsing error - fall back to full file
          res.setHeader("Content-Length", stats.size);
          fileStream = fsSync.createReadStream(destinationPath);
        }
      }
    } else {
      // Normal download
      res.setHeader("Content-Length", stats.size);
      fileStream = fsSync.createReadStream(destinationPath);
    }

    // Handle stream errors
    fileStream.on("error", (err) => {
      logger.error(requestId, "Stream error occurred", err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    logger.info(requestId, "Starting file stream");
    fileStream.pipe(res);
  } catch (error) {
    logger.error(requestId, "Download failed", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Add at the top of server.js with other utilities
function normalizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
}

// After client initialization
logger.info("Initializing client", {
  nodeAddress: process.env.NODE_ADDRESS,
  privateKeyLength: process.env.PRIVATE_KEY
    ? process.env.PRIVATE_KEY.length
    : 0,
});
