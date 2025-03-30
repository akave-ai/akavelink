import express, { Request, Response } from "express"
import AkaveIPCClient from "./index"
import multer from "multer"
import { promises as fs } from "fs"
import fsSync from "fs"
import path from "path"
import os from "os"
import dotenv from "dotenv"
import cors from "cors"
import logger from "./logger"

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

// Configure CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type"],
  })
)

// Parse JSON bodies
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
const client = new AkaveIPCClient(
  process.env.NODE_ADDRESS || "",
  process.env.PRIVATE_KEY || ""
)

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" })
})

// Bucket Operations
app.post("/buckets", async (req: Request, res: Response) => {
  try {
    const { bucketName } = req.body
    if (!bucketName) {
      return res.status(400).json({ error: "Bucket name is required" })
    }

    const result = await client.createBucket(bucketName)
    res.json(result)
  } catch (error) {
    logger.error("Failed to create bucket", {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: "Failed to create bucket" })
  }
})

app.delete("/buckets/:bucketName", async (req: Request, res: Response) => {
  try {
    const { bucketName } = req.params
    if (!bucketName) {
      return res.status(400).json({ error: "Bucket name is required" })
    }

    const result = await client.deleteBucket(bucketName)
    res.json(result)
  } catch (error) {
    logger.error("Failed to delete bucket", {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: "Failed to delete bucket" })
  }
})

app.get("/buckets/:bucketName", async (req: Request, res: Response) => {
  try {
    const { bucketName } = req.params
    if (!bucketName) {
      return res.status(400).json({ error: "Bucket name is required" })
    }

    const result = await client.viewBucket(bucketName)
    res.json(result)
  } catch (error) {
    logger.error("Failed to view bucket", {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: "Failed to view bucket" })
  }
})

app.get("/buckets", async (req: Request, res: Response) => {
  try {
    const result = await client.listBuckets()
    res.json(result)
  } catch (error) {
    logger.error("Failed to list buckets", {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: "Failed to list buckets" })
  }
})

// File Operations
app.get("/buckets/:bucketName/files", async (req: Request, res: Response) => {
  try {
    const { bucketName } = req.params
    if (!bucketName) {
      return res.status(400).json({ error: "Bucket name is required" })
    }

    const result = await client.listFiles(bucketName)
    res.json(result)
  } catch (error) {
    logger.error("Failed to list files", {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: "Failed to list files" })
  }
})

app.get(
  "/buckets/:bucketName/files/:fileName",
  async (req: Request, res: Response) => {
    try {
      const { bucketName, fileName } = req.params
      if (!bucketName || !fileName) {
        return res
          .status(400)
          .json({ error: "Bucket name and file name are required" })
      }

      const result = await client.getFileInfo(bucketName, fileName)
      res.json(result)
    } catch (error) {
      logger.error("Failed to get file info", {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ error: "Failed to get file info" })
    }
  }
)

interface MulterRequest extends Request {
  files?:
    | {
        [fieldname: string]: Express.Multer.File[]
      }
    | Express.Multer.File[]
}

app.post(
  "/buckets/:bucketName/files",
  upload,
  async (req: MulterRequest, res: Response) => {
    try {
      const { bucketName } = req.params
      if (!bucketName) {
        return res.status(400).json({ error: "Bucket name is required" })
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] }
      const file = files?.["file"]?.[0] || files?.["file1"]?.[0]
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" })
      }

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "akave-"))
      const tempFilePath = path.join(tempDir, file.originalname)
      await fs.writeFile(tempFilePath, file.buffer)

      const result = await client.uploadFile(bucketName, tempFilePath)

      // Clean up temp file
      await fs.unlink(tempFilePath)
      await fs.rmdir(tempDir)

      res.json(result)
    } catch (error) {
      logger.error("Failed to upload file", {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ error: "Failed to upload file" })
    }
  }
)

app.get(
  "/buckets/:bucketName/files/:fileName/download",
  async (req: Request, res: Response) => {
    try {
      const { bucketName, fileName } = req.params
      if (!bucketName || !fileName) {
        return res
          .status(400)
          .json({ error: "Bucket name and file name are required" })
      }

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "akave-"))
      const tempFilePath = path.join(tempDir, fileName)

      await client.downloadFile(bucketName, fileName, tempFilePath)

      // Stream the file to the response
      const fileStream = fsSync.createReadStream(tempFilePath)
      res.setHeader("Content-Type", "application/octet-stream")
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)
      fileStream.pipe(res)

      // Clean up temp file after streaming
      fileStream.on("end", async () => {
        try {
          await fs.unlink(tempFilePath)
          await fs.rmdir(tempDir)
        } catch (error) {
          logger.error("Failed to clean up temp file", {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })
    } catch (error) {
      logger.error("Failed to download file", {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ error: "Failed to download file" })
    }
  }
)

// Start the server
app.listen(port, () => {
  logger.info(`Server is running on port ${port}`)
})
