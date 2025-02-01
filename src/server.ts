import express, { Request, Response, Express } from "express";
import AkaveIPCClient from "./index";
import multer, { FileFilterCallback } from "multer";
import { promises as fs } from "fs";
import * as fsSync from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";
import cors from "cors";

// Type definitions
interface BucketResponse {
  success: boolean;
  data?: any;
  error?: string;
}


interface FileUploadRequest extends Request {
  params: {
    bucketName: string;
  };
  body: {
    filePath?: string;
  };
  files?: {
    [fieldname: string]: Express.Multer.File[];
  };
}

interface CreateBucketRequest extends Request {
  body: {
    bucketName: string;
  };
}

interface BucketParams {
  bucketName: string;
}

interface FileParams extends BucketParams {
  fileName: string;
}

interface Logger {
  info: (id: string, message: string, data?: any) => void;
  error: (id: string, message: string, error?: any) => void;
  warn: (id: string, message: string, data?: any) => void;
}

dotenv.config();

// Initialize express app
const app: Express = express();

// Configure CORS
const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
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
]) as unknown as express.RequestHandler; //helps TypeScript understand that the upload middleware is compatible with Express's request handler signature.
//multer's type definitions don't perfectly align with Express's middleware types.

// Initialize Akave IPC client
const client = new AkaveIPCClient({
  nodeAddress: process.env.NODE_ADDRESS!,
  privateKey: process.env.PRIVATE_KEY!
});

// Add a simple logger
const logger: Logger = {
  info: (id: string, message: string, data: any = {}) => {
    console.log(`[${id}] 🔵 ${message}`, data);
  },
  error: (id: string, message: string, error: any = {}) => {
    console.error(`[${id}] 🔴 ${message}`, error);
  },
  warn: (id: string, message: string, data: any = {}) => {
    console.warn(`[${id}] 🟡 ${message}`, data);
  }
};

// After client initialization
logger.info('INIT', 'Initializing client', {
  nodeAddress: process.env.NODE_ADDRESS,
  privateKeyLength: process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.length : 0,
});

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Bucket endpoints
app.post("/buckets", async (req: CreateBucketRequest, res: Response<BucketResponse>) => {
  try {
    const { bucketName } = req.body;
    const result = await client.createBucket(bucketName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get("/buckets", async (_req: Request, res: Response<BucketResponse>) => {
  try {
    const result = await client.listBuckets();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get("/buckets/:bucketName", async (req: Request<BucketParams>, res: Response<BucketResponse>) => {
  try {
    const result = await client.viewBucket(req.params.bucketName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.delete("/buckets/:bucketName", async (req: Request<BucketParams>, res: Response<BucketResponse>) => {
  try {
    const result = await client.deleteBucket(req.params.bucketName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// File endpoints
app.get("/buckets/:bucketName/files", async (req: Request<BucketParams>, res: Response<BucketResponse>) => {
  try {
    const result = await client.listFiles(req.params.bucketName);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get("/buckets/:bucketName/files/:fileName", async (req: Request<FileParams>, res: Response<BucketResponse>) => {
  try {
    const result = await client.getFileInfo(
      req.params.bucketName,
      req.params.fileName
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post("/buckets/:bucketName/files", 
  upload,
  async (req: Request & { file?: Express.Multer.File }, res: Response<BucketResponse>) => {
    const requestId = Math.random().toString(36).substring(7);
    try {
      logger.info(requestId, 'Processing file upload request', { 
        bucket: req.params.bucketName
      });
      let result;
      const uploadedFile = req.files && 
        (Array.isArray(req.files) 
          ? req.files[0]
          : (req.files['file']?.[0] || req.files['file1']?.[0]));

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
          result = await client.uploadFile(req.params.bucketName, tempFilePath);
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
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });



app.get("/buckets/:bucketName/files/:fileName/download", async (req: Request<FileParams>, res: Response) => {
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
    fileStream.on("error", (err: Error) => {
      logger.error(requestId, 'Stream error occurred', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    logger.info(requestId, 'Starting file stream');
    fileStream.pipe(res);
  } catch (error) {
    logger.error(requestId, 'Download failed', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});