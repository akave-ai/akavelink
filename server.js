const express = require("express");
const AkaveIPCClient = require("./index");
const multer = require("multer");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");
const cors = require("cors");
const { EventEmitter } = require('events');

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

// Initialize event emitter for upload progress
const uploadProgressEmitter = new EventEmitter();

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

// After client initialization
logger.info('INIT', 'Initializing client', {
  nodeAddress: process.env.NODE_ADDRESS,
  privateKeyLength: process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.length : 0,
});

// Create SSE middleware for progress updates
const sseMiddleware = (req, res, next) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial connection message
  res.write('event: connected\ndata: true\n\n');

  next();
};

// Progress tracking endpoint using Server-Sent Events
app.get('/upload-progress/:requestId', sseMiddleware, (req, res) => {
  const { requestId } = req.params;

  const sendProgress = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Listen for progress events for this specific request
  uploadEmitter.on(`${requestId}:start`, sendProgress);
  uploadEmitter.on(`${requestId}:progress`, sendProgress);
  uploadEmitter.on(`${requestId}:complete`, sendProgress);
  uploadEmitter.on(`${requestId}:error`, sendProgress);

  // Clean up when client disconnects
  req.on('close', () => {
    uploadEmitter.removeAllListeners(`${requestId}:start`);
    uploadEmitter.removeAllListeners(`${requestId}:progress`);
    uploadEmitter.removeAllListeners(`${requestId}:complete`);
    uploadEmitter.removeAllListeners(`${requestId}:error`);
  });
});

// Upload progress handler
function createUploadProgressHandler(requestId) {
  let uploadedBytes = 0;
  let totalBytes = 0;

  return {
    start: (total) => {
      totalBytes = total;
      uploadEmitter.emit(`${requestId}:start`, {
        type: 'start',
        requestId,
        totalBytes,
        message: 'Upload started'
      });
      logger.info(requestId, 'Upload started', { totalBytes });
    },

    progress: (chunk) => {
      uploadedBytes += chunk.length;
      const progress = Math.round((uploadedBytes / totalBytes) * 100);

      uploadEmitter.emit(`${requestId}:progress`, {
        type: 'progress',
        requestId,
        uploadedBytes,
        totalBytes,
        progress,
        message: `Uploaded ${uploadedBytes} of ${totalBytes} bytes (${progress}%)`
      });

      if (progress % 10 === 0) { // Log every 10%
        logger.info(requestId, 'Upload progress', { progress, uploadedBytes, totalBytes });
      }
    },

    complete: () => {
      uploadEmitter.emit(`${requestId}:complete`, {
        type: 'complete',
        requestId,
        message: 'Upload completed successfully'
      });
      logger.info(requestId, 'Upload completed', { totalBytes });
    },

    error: (error) => {
      uploadEmitter.emit(`${requestId}:error`, {
        type: 'error',
        requestId,
        error: error.message,
        message: 'Upload failed'
      });
      logger.error(requestId, 'Upload failed', error);
    }
  };
}

// Upload middleware with progress tracking
const uploadWithProgress = (req, res, next) => {
  const requestId = Math.random().toString(36).substring(7);
  const progressHandler = createUploadProgressHandler(requestId);

  upload(req, res, (err) => {
    if (err) {
      progressHandler.error(err);
      return res.status(500).json({ success: false, error: err.message });
    }
    req.requestId = requestId;
    next();
  });

  req.on('request', () => {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (contentLength) {
      progressHandler.start(contentLength);
    }
  });

  req.on('data', (chunk) => {
    progressHandler.progress(chunk);
  });

  req.on('end', () => {
    progressHandler.complete();
  });

  req.on('error', (error) => {
    progressHandler.error(error);
  });
};

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
app.post("/buckets/:bucketName/files", uploadWithProgress, async (req, res) => {
  const requestId = req.requestId;
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
      throw new Error("No file or filePath provided");
    }

    logger.info(requestId, 'File upload completed', { result });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(requestId, 'File upload failed', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/buckets/:bucketName/files/:fileName/download", async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  try {
    logger.info(requestId, 'Processing download request', {
      bucket: req.params.bucketName,
      file: req.params.fileName
    });

    // Create downloads directory if it doesn't exist
    const downloadDir = path.join(process.cwd(), "downloads");
    await fs.mkdir(downloadDir, { recursive: true });

    const destinationPath = path.join(downloadDir, req.params.fileName);

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
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    logger.info(requestId, 'Starting file stream');
    fileStream.pipe(res);
  } catch (error) {
    logger.error(requestId, 'Download failed', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});