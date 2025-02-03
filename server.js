const express = require("express");
const AkaveIPCClient = require("./index");
const multer = require("multer");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");
const cors = require("cors");
const errorHandler = require('./src/middleware/errorHandler');
const { ValidationError, BucketOperationError, FileOperationError } = require('./src/errors/customErrors');


dotenv.config();

// Initialize express app
const app = express();

// Configure CORS
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Middleware to parse JSON bodies
app.use(express.json());

//Error handler middleware
app.use(errorHandler);


// Add request ID middleware
app.use((req, res, next) => {
  req.requestId = Math.random().toString(36).substring(7);
  next();
});

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

// Add a simple logger
const logger = {
  info: (id, message, data = {}) => {
    console.log(`[${id}] 🔵 ${message}`, data);
  },
  error: (id, message, error = {}) => {
    console.error(`[${id}] 🔴 ${message}`, error);
  },
  warn: (id, message, data = {}) => {
    console.warn(`[${id}] 🟡 ${message}`, data);
  }
};

// Logger set up
app.set('logger', logger);


// After client initialization
logger.info('INIT', 'Initializing client', {
  nodeAddress: process.env.NODE_ADDRESS,
  privateKeyLength: process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.length : 0,
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Bucket endpoints
app.post("/buckets", async (req, res) => {
  try {
    const { bucketName } = req.body;
    if (!bucketName) {
      throw new ValidationError('Bucket name is required');
    }
    if (!/^[a-zA-Z0-9-_]+$/.test(bucketName)) {
      throw new ValidationError('Bucket name can only contain letters, numbers, hyphens and underscores');
    }
    const result = await client.createBucket(bucketName);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

app.get("/buckets", async (req, res) => {
  try {
    const result = await client.listBuckets().catch(error => {
      throw new BucketOperationError('Failed to list buckets', { error: error.message });
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

app.get("/buckets/:bucketName", async (req, res) => {
  try {
    if (!req.params.bucketName) {
      throw new ValidationError('Bucket name is required');
    }
    const result = await client.viewBucket(req.params.bucketName).catch(error => {
      throw new BucketOperationError('Failed to view bucket', { 
        bucketName: req.params.bucketName,
        error: error.message 
      });
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

app.delete("/buckets/:bucketName", async (req, res) => {
  try {
    if (!req.params.bucketName) {
      throw new ValidationError('Bucket name is required');
    }
    const result = await client.deleteBucket(req.params.bucketName).catch(error => {
      throw new BucketOperationError('Failed to delete bucket', {
        bucketName: req.params.bucketName,
        error: error.message
      });
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// File endpoints
app.get("/buckets/:bucketName/files", async (req, res) => {
  try {
    if (!req.params.bucketName) {
      throw new ValidationError('Bucket name is required');
    }
    const result = await client.listFiles(req.params.bucketName).catch(error => {
      throw new FileOperationError('Failed to list files', {
        bucketName: req.params.bucketName,
        error: error.message
      });
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error)
  }
});

app.get("/buckets/:bucketName/files/:fileName", async (req, res) => {
  try {
    if (!req.params.bucketName || !req.params.fileName) {
      throw new ValidationError('Bucket name and file name are required');
    }
    const result = await client.getFileInfo(
      req.params.bucketName,
      req.params.fileName
    ).catch(error => {
      throw new FileOperationError('Failed to get file info', {
        bucketName: req.params.bucketName,
        fileName: req.params.fileName,
        error: error.message
      });
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error)
  }
});

// Modified file upload endpoint
app.post("/buckets/:bucketName/files", upload, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  try {
    
    logger.info(requestId, 'Processing file upload request', { 
      bucket: req.params.bucketName 
    });

    let result;
    const uploadedFile = req.files?.file?.[0] || req.files?.file1?.[0];

    if (uploadedFile) {
      logger.info(requestId, 'Handling buffer upload', { 
        filename: uploadedFile.originalname 
      });
      // Handle buffer upload
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "akave-"));
      // Sanitize filename by replacing spaces and special chars with underscore
      const sanitizedFileName = uploadedFile.originalname.replace(
        /[^a-zA-Z0-9.]/g,
        "_"
      );
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
      logger.info(requestId, 'Handling file path upload', { 
        path: req.body.filePath 
      });
      // Handle file path upload
      result = await client.uploadFile(
        req.params.bucketName,
        req.body.filePath
      );
    } else {
      throw new ValidationError('No file or filePath provided');
    }

    logger.info(requestId, 'File upload completed', { result });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

app.get("/buckets/:bucketName/files/:fileName/download", async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  try {
    if (!req.params.bucketName || !req.params.fileName) {
      throw new ValidationError('Bucket name and file name are required');
    }
    
    logger.info(requestId, 'Processing download request', {
      bucket: req.params.bucketName,
      file: req.params.fileName
    });

    // Create downloads directory if it doesn't exist
    const downloadDir = path.join(process.cwd(), "downloads").catch(error => {
      throw new FileOperationError('Failed to create download directory', {
        path: downloadDir,
        error: error.message
      });
    });
    await fs.mkdir(downloadDir, { recursive: true });

    const destinationPath = path.join(downloadDir, req.params.fileName);

    // Download the file
    await client.downloadFile(
      req.params.bucketName,
      req.params.fileName,
      downloadDir
    ).catch(error => {
      throw new FileOperationError('Failed to download file', {
        bucketName: req.params.bucketName,
        fileName: req.params.fileName,
        error: error.message
      });
    });

    // Check if file exists and is readable
    try {
      await fs.access(destinationPath, fsSync.constants.R_OK);
    } catch (err) {
      throw new FileOperationError("File download failed or file is not readable", {
        path: destinationPath,
        error: err.message
      });
    }

    // Get file stats
    const stats = await fs.stat(destinationPath);

    // Set headers for file download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${req.params.fileName}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", stats.size);

    // Stream the file to response
    const fileStream = fsSync.createReadStream(destinationPath);

    // Handle stream errors
    fileStream.on("error", (err) => {
      logger.error(requestId, 'Stream error occurred', err);
      next(new FileOperationError('Error streaming file', { 
        path: destinationPath,
        error: err.message 
      }));
    });

    logger.info(requestId, 'Starting file stream');
    fileStream.pipe(res);
  } catch (error) {
    next(error)
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
