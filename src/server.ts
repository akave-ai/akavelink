import express, { Request, Response } from "express";
import multer from "multer";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";
import cors from "cors";
import logger from "./logger";
import AkaveIPCClient from "./index";

dotenv.config();

if (!process.env.NODE_ADDRESS || !process.env.PRIVATE_KEY) {
  throw new Error("NODE_ADDRESS and PRIVATE_KEY must be set in .env");
}

const app = express();

// CORS Configuration
const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json());

// Multer file upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "file1", maxCount: 1 },
]);

const client = new AkaveIPCClient(
  process.env.NODE_ADDRESS,
  process.env.PRIVATE_KEY
);

function normalizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
}

logger.info("Initializing client", {
  nodeAddress: process.env.NODE_ADDRESS,
  privateKeyLength: process.env.PRIVATE_KEY?.length || 0,
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Bucket routes
app.post("/buckets", async (req: Request, res: Response) => {
  try {
    const { bucketName } = req.body;
    const result = await client.createBucket(bucketName);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/buckets", async (_req: Request, res: Response) => {
  try {
    const result = await client.listBuckets();
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/buckets/:bucketName", async (req: Request, res: Response) => {
  try {
    const result = await client.viewBucket(req.params.bucketName);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/buckets/:bucketName", async (req: Request, res: Response) => {
  try {
    const result = await client.deleteBucket(req.params.bucketName);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// File routes
app.get("/buckets/:bucketName/files", async (req: Request, res: Response) => {
  try {
    const result = await client.listFiles(req.params.bucketName);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get(
  "/buckets/:bucketName/files/:fileName",
  async (req: Request, res: Response) => {
    try {
      const result = await client.getFileInfo(
        req.params.bucketName,
        req.params.fileName
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

app.post(
  "/buckets/:bucketName/files",
  upload,
  async (req: Request, res: Response) => {
    const requestId = Math.random().toString(36).substring(7);
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const uploadedFile = files?.file?.[0] || files?.file1?.[0];

      let result;

      if (uploadedFile) {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "akave-"));
        const sanitizedFileName = normalizeFileName(uploadedFile.originalname);
        const tempFilePath = path.join(tempDir, sanitizedFileName);

        try {
          await fs.writeFile(tempFilePath, uploadedFile.buffer);
          result = await client.uploadFile(
            req.params.bucketName,
            tempFilePath,
            {
              fileName: uploadedFile.originalname,
              cleanup: true,
            }
          );
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      } else if (req.body.filePath) {
        result = await client.uploadFile(
          req.params.bucketName,
          req.body.filePath
        );
      } else {
        throw new Error("No file or filePath provided");
      }

      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error("File upload failed", { requestId, error });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

app.get(
  "/buckets/:bucketName/files/:fileName/download",
  (req: Request, res: Response): void => {
    void (async () => {
      const requestId = Math.random().toString(36).substring(7);
      try {
        const downloadDir = path.join(process.cwd(), "downloads");
        await fs.mkdir(downloadDir, { recursive: true });

        const normalizedFileName = normalizeFileName(req.params.fileName);
        const destinationPath = path.join(downloadDir, normalizedFileName);

        await client.downloadFile(
          req.params.bucketName,
          req.params.fileName,
          downloadDir
        );

        try {
          await fs.access(destinationPath, fsSync.constants.R_OK);
        } catch {
          throw new Error("File download failed or file is not readable");
        }

        const stats = await fs.stat(destinationPath);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${req.params.fileName}"`
        );
        res.setHeader("Content-Type", "application/octet-stream");

        const range = req.headers.range;
        let fileStream: fsSync.ReadStream;

        if (range && range.startsWith("bytes=")) {
          const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
          const start = parseInt(startStr, 10);
          const end = endStr ? parseInt(endStr, 10) : stats.size - 1;

          if (
            isNaN(start) ||
            isNaN(end) ||
            start >= stats.size ||
            end >= stats.size ||
            start > end
          ) {
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
        } else {
          res.setHeader("Content-Length", stats.size);
          fileStream = fsSync.createReadStream(destinationPath);
        }

        fileStream.on("error", (err) => {
          logger.error("Stream error occurred", { requestId, err });
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
          }
        });

        fileStream.pipe(res);
      } catch (error: any) {
        logger.error("Download failed", { requestId, error });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: error.message });
        }
      }
    })();
  }
);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
