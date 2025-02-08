import express, { Request, Response } from "express"
import multer from "multer"
import { promises as fs, constants as fsConstants, createReadStream } from "fs"
import path from "path"
import os from "os"
import dotenv from "dotenv"
import cors from "cors"
import AkaveIPCClient from "./index"

dotenv.config()

// Types
interface Logger {
  info: (id: string, message: string, data?: object) => void
  error: (id: string, message: string, error?: object) => void
  warn: (id: string, message: string, data?: object) => void
}

// Initialize express app
const app = express()

// Configure CORS
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
}

app.use(cors(corsOptions))
app.use(express.json())

// Configure multer for file upload handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
}).fields([
  { name: "file", maxCount: 1 },
  { name: "file1", maxCount: 1 },
])

// Initialize Akave IPC client
const client = new AkaveIPCClient({
  nodeAddress: process.env.NODE_ADDRESS!,
  privateKey: process.env.PRIVATE_KEY!,
})

// Add a simple logger
const logger: Logger = {
  info: (id, message, data = {}) => {
    console.log(`[${id}] 🔵 ${message}`, data)
  },
  error: (id, message, error = {}) => {
    console.error(`[${id}] 🔴 ${message}`, error)
  },
  warn: (id, message, data = {}) => {
    console.warn(`[${id}] 🟡 ${message}`, data)
  },
}

// After client initialization
logger.info("INIT", "Initializing client", {
  nodeAddress: process.env.NODE_ADDRESS,
  privateKeyLength: process.env.PRIVATE_KEY?.length || 0,
})

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" })
})

// Bucket endpoints
app.post("/buckets", async (req: Request, res: Response) => {
  try {
    const { bucketName } = req.body
    const result = await client.createBucket(bucketName)
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : error,
    })
  }
})

app.get("/buckets", async (_req: Request, res: Response) => {
  try {
    const result = await client.listBuckets()
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : error,
    })
  }
})

// File upload endpoint
app.post(
  "/buckets/:bucketName/files",
  upload,
  async (req: any, res: Response) => {
    const requestId = Math.random().toString(36).substring(7)
    try {
      logger.info(requestId, "Processing file upload request", {
        bucket: req.params.bucketName,
      })

      let result
      const uploadedFile = req.files?.file?.[0] || req.files?.file1?.[0]

      if (uploadedFile) {
        logger.info(requestId, "Handling buffer upload", {
          filename: uploadedFile.originalname,
        })
        // Handle buffer upload
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "akave-"))
        const sanitizedFileName = normalizeFileName(uploadedFile.originalname)
        const tempFilePath = path.join(tempDir, sanitizedFileName)

        try {
          await fs.writeFile(tempFilePath, uploadedFile.buffer)
          result = await client.uploadFile(req.params.bucketName, tempFilePath)
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true })
        }
      } else if (req.body.filePath) {
        logger.info(requestId, "Handling file path upload", {
          path: req.body.filePath,
        })
        result = await client.uploadFile(
          req.params.bucketName,
          req.body.filePath
        )
      } else {
        throw new Error("No file or filePath provided")
      }

      logger.info(requestId, "File upload completed", { result })
      res.json({ success: true, data: result })
    } catch (error) {
      logger.error(requestId, "File upload failed", {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : error,
      })
    }
  }
)

// File download endpoint
app.get(
  "/buckets/:bucketName/files/:fileName/download",
  async (req: Request, res: Response) => {
    const requestId = Math.random().toString(36).substring(7)
    try {
      logger.info(requestId, "Processing download request", {
        bucket: req.params.bucketName,
        file: req.params.fileName,
      })

      const downloadDir = path.join(process.cwd(), "downloads")
      await fs.mkdir(downloadDir, { recursive: true })

      const normalizedFileName = normalizeFileName(req.params.fileName)
      const destinationPath = path.join(downloadDir, normalizedFileName)

      await client.downloadFile(
        req.params.bucketName,
        req.params.fileName,
        downloadDir
      )

      try {
        await fs.access(destinationPath, fsConstants.R_OK)
      } catch (err) {
        throw new Error("File download failed or file is not readable")
      }

      const stats = await fs.stat(destinationPath)

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${req.params.fileName}"`
      )
      res.setHeader("Content-Type", "application/octet-stream")
      res.setHeader("Content-Length", stats.size)

      const fileStream = createReadStream(destinationPath)

      fileStream.on("error", (err) => {
        logger.error(requestId, "Stream error occurred", err)
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : err,
          })
        }
      })

      logger.info(requestId, "Starting file stream")
      fileStream.pipe(res)
    } catch (error) {
      logger.error(requestId, "Download failed", {
        error: error instanceof Error ? error.message : error,
      })
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : error,
      })
    }
  }
)

// Utility function
function normalizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, "_")
}

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
