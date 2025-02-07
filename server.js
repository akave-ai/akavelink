const express = require("express");
const AkaveIPCClient = require("./index");
const multer = require("multer");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

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

// Swagger UI Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


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
  },
};

// After client initialization
logger.info("INIT", "Initializing client", {
  nodeAddress: process.env.NODE_ADDRESS,
  privateKeyLength: process.env.PRIVATE_KEY
    ? process.env.PRIVATE_KEY.length
    : 0,
});

// Health check endpoint

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Bucket endpoints

/**
 * @swagger
 * /buckets:
 *   post:
 *     summary: Create a new bucket
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bucketName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bucket created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *   get:
 *     summary: List all buckets
 *     responses:
 *       200:
 *         description: List of buckets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */

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

/**
 * @swagger
 * /buckets/{bucketName}:
 *   get:
 *     summary: View a specific bucket
 *     parameters:
 *       - in: path
 *         name: bucketName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bucket details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *   delete:
 *     summary: Delete a bucket
 *     parameters:
 *       - in: path
 *         name: bucketName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bucket deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */

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
/**
 * @swagger
 * /buckets/{bucketName}/files:
 *   get:
 *     summary: List files in a bucket
 *     parameters:
 *       - in: path
 *         name: bucketName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */

app.get("/buckets/:bucketName/files", async (req, res) => {
  try {
    const result = await client.listFiles(req.params.bucketName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /buckets/{bucketName}/files/{fileName}:
 *   get:
 *     summary: Get file information
 *     parameters:
 *       - in: path
 *         name: bucketName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */

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
/**
 * @swagger
 * /buckets/{bucketName}/files:
 *   post:
 *     summary: Upload a file to a bucket
 *     parameters:
 *       - in: path
 *         name: bucketName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               filePath:
 *                 type: string
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
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

/**
 * @swagger
 * /buckets/{bucketName}/files/{fileName}/download:
 *   get:
 *     summary: Download a file
 *     parameters:
 *       - in: path
 *         name: bucketName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Download error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 */

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
  console.log(`Server running on port ${PORT}`);
});
