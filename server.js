const express = require("express");
const AkaveIPCClient = require("./index");
const multer = require("multer");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");
const cors = require("cors");
const { responseHandler } = require("./src/middleware/response-handler");
const { errorHandler } = require("./src/middleware/error-handler");
const { validateBucketName } = require("./src/middleware/request-validator");
const { logInfo, logError, logWarning } = require('./src/utils/logger');

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
app.use(responseHandler);
app.use(errorHandler);

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

// attach the client to the app
app.use((req, res, next) => {
  req.client = client;
  req.id = Math.random().toString(36).substring(7);
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.sendSuccess({ status: "ok" });
});

// Bucket endpoints
app.post("/buckets", validateBucketName, async (req, res) => {
  try {
    const { bucketName } = req.body;
    const result = await req.client.createBucket(bucketName);
    res.sendSuccess(result);
  } catch (error) {
    res.sendError(error);
    // next(error);
  }
});

// Get all buckets
app.get("/buckets", async (req, res) => {
  try {
    const result = await req.client.listBuckets();
    res.sendSuccess(result);
  } catch (error) {
    res.sendError(error);
    // next(error);
  }
});

// Get a bucket by name
app.get("/buckets/:bucketName", async (req, res) => {
  try {
    const result = await req.client.viewBucket(req.params.bucketName);
    res.sendSuccess(result);
  } catch (error) {
    res.sendError(error);
    // next(error);
  }
});

app.delete("/buckets/:bucketName", async (req, res) => {
  try {
    console.log('Deleting bucket', req.params.bucketName);
    const result = await req.client.deleteBucket(req.params.bucketName);
    res.sendSuccess(result);
  } catch (error) {
    res.sendError(error);
  }
});

// Get all files in a bucket
app.get("/buckets/:bucketName/files", async (req, res) => {
  try {
    const result = await client.listFiles(req.params.bucketName);
    res.sendSuccess(result);
  } catch (error) {
    res.sendError(error);
    next(error);
  }
});

app.get("/buckets/:bucketName/files/:fileName", async (req, res) => {
  try {
    const result = await req.client.getFileInfo(
      req.params.bucketName,
      req.params.fileName
    );
    res.sendSuccess(result);
  } catch (error) {
    res.sendError(error);
  }
});

// Modified file upload endpoint
app.post("/buckets/:bucketName/files", upload, async (req, res) => {
  try {
    logInfo(req.id, "Processing file upload request", {
      bucket: req.params.bucketName,
    });

    let result;
    const uploadedFile = req.files?.file?.[0] || req.files?.file1?.[0];

    if (uploadedFile) {
      logInfo(req.id, "Handling buffer upload", {
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
        result = await req.client.uploadFile(
          req.params.bucketName,
          tempFilePath,
          {
            fileName: uploadedFile.originalname,
            cleanup: true, // Tell client to cleanup temp file
          }
        );
        logInfo(req.id, "File uploaded successfully", { result });
      } finally {
        // Cleanup temp directory
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    } else if (req.body.filePath) {
      logInfo(req.id, "Handling file path upload", {
        path: req.body.filePath,
      });
      // Handle file path upload
      result = await req.client.uploadFile(
        req.params.bucketName,
        req.body.filePath
      );
    }

    logInfo(req.id, "File upload completed", { result });
    res.sendSuccess(result);
  } catch (error) {
    logError(req.id, "File upload failed", error);
    res.sendError(error);
  }
});

app.get("/buckets/:bucketName/files/:fileName/download", async (req, res) => {
  try {
    logInfo(req.id, "Processing download request", {
      bucket: req.params.bucketName,
      file: req.params.fileName,
    });

    // Create downloads directory if it doesn't exist
    const downloadDir = path.join(process.cwd(), "downloads");
    await fs.mkdir(downloadDir, { recursive: true });

    const normalizedFileName = normalizeFileName(req.params.fileName);
    const destinationPath = path.join(downloadDir, normalizedFileName);

    // Download the file
    await req.client.downloadFile(
      req.params.bucketName,
      req.params.fileName,
      downloadDir
    );

    // Check if file exists and is readable
    try {
      await fs.access(destinationPath, fsSync.constants.R_OK);
    } catch (err) {
      res.sendError(err);
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
      // Handle range request
      try {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

        if (start >= stats.size || end >= stats.size) {
          // Invalid range
          res.status(416).json({
            success: false,
            error: "Requested range not satisfiable",
          });
          return;
        }

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${stats.size}`);
        res.setHeader("Content-Length", end - start + 1);
        fileStream = fsSync.createReadStream(destinationPath, { start, end });
      } catch (rangeError) {
        // If range parsing fails, fall back to full file download
        logWarning(
          req.id,
          "Invalid range header, falling back to full download",
          { range }
        );
        res.setHeader("Content-Length", stats.size);
        fileStream = fsSync.createReadStream(destinationPath);
      }
    } else {
      // Normal download
      res.setHeader("Content-Length", stats.size);
      fileStream = fsSync.createReadStream(destinationPath);
    }

    // Handle stream errors
    fileStream.on("error", (err) => {
      logError(req.id, "Stream error occurred", err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    logInfo(req.id, "Starting file stream");
    fileStream.pipe(res);
  } catch (error) {
    logError(req.id, "Download failed", error);
    res.sendError(error);
  }
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Add at the top of server.js with other utilities
function normalizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
}
