import { spawn, ChildProcess } from "child_process"
import { privateKeyToAccount } from "viem/accounts"
import logger from "./logger"

interface BucketInfo {
  Name?: string
  [key: string]: string | undefined
}

interface FileInfo {
  Name?: string
  [key: string]: string | undefined
}

type ParserType =
  | "default"
  | "createBucket"
  | "listBuckets"
  | "viewBucket"
  | "deleteBucket"
  | "listFiles"
  | "fileInfo"
  | "uploadFile"
  | "downloadFile"

class AkaveIPCClient {
  private nodeAddress: string
  private privateKey: string
  public address: string

  constructor(nodeAddress: string, privateKey: string) {
    this.nodeAddress = nodeAddress
    if (privateKey && privateKey.startsWith("0x")) {
      this.privateKey = privateKey.slice(2)
    } else {
      this.privateKey = privateKey
    }
    this.address = privateKeyToAccount(`0x${this.privateKey}`).address
  }

  private async executeCommand(
    args: string[],
    parser: ParserType = "default"
  ): Promise<any> {
    const commandId = Math.random().toString(36).substring(7)
    logger.info(`Executing ${args[1]} ${args[2]} command`, { commandId })

    return new Promise((resolve, reject) => {
      const process: ChildProcess = spawn("akavecli", args)
      let stdout = ""
      let stderr = ""

      if (process.stdout) {
        process.stdout.on("data", (data: Buffer) => {
          stdout += data.toString()
          logger.debug(`Command output`, {
            commandId,
            output: data.toString().trim(),
          })
        })
      }

      if (process.stderr) {
        process.stderr.on("data", (data: Buffer) => {
          stderr += data.toString()
          if (!data.toString().includes("File uploaded successfully:")) {
            logger.debug(`Command output from stderr`, {
              commandId,
              output: data.toString().trim(),
            })
          }
        })
      }

      process.on("close", (code: number | null) => {
        const output = (stdout + stderr).trim()

        if (code === 0) {
          logger.info(`Command completed successfully`, { commandId })
        } else {
          logger.error(`Command failed with code: ${code}`, { commandId })
        }

        try {
          const result = this.parseOutput(output, parser)
          resolve(result)
        } catch (error) {
          logger.error(`Failed to parse output`, {
            commandId,
            error: error instanceof Error ? error.message : String(error),
          })
          reject(error)
        }
      })

      process.on("error", (err: Error) => {
        logger.error(`Process error`, {
          commandId,
          error: err.message,
        })
        reject(err)
      })
    })
  }

  private parseOutput(output: string, parser: ParserType): any {
    try {
      return JSON.parse(output)
    } catch (e) {
      // Not JSON, continue with specific parsers
    }

    switch (parser) {
      case "createBucket":
        return this.parseBucketCreation(output)
      case "listBuckets":
        return this.parseBucketList(output)
      case "viewBucket":
        return this.parseBucketView(output)
      case "deleteBucket":
        return this.parseBucketDeletion(output)
      case "listFiles":
        return this.parseFileList(output)
      case "fileInfo":
        return this.parseFileInfo(output)
      case "uploadFile":
        return this.parseFileUpload(output)
      case "downloadFile":
        return this.parseFileDownload(output)
      default:
        return output
    }
  }

  private parseBucketCreation(output: string): BucketInfo {
    if (!output.startsWith("Bucket created:")) {
      throw new Error("Unexpected output format for bucket creation")
    }
    const bucketInfo = output
      .substring("Bucket created:".length)
      .trim()
      .split(", ")
    const bucket: BucketInfo = {}
    bucketInfo.forEach((info) => {
      const [key, value] = info.split("=")
      bucket[key.trim()] = value.trim()
    })
    return bucket
  }

  private parseBucketList(output: string): BucketInfo[] {
    const buckets: BucketInfo[] = []
    const lines = output.split("\n")
    for (const line of lines) {
      if (line.startsWith("Bucket:")) {
        const bucketInfo = line.substring(8).split(", ")
        const bucket: BucketInfo = {}
        bucketInfo.forEach((info) => {
          const [key, value] = info.split("=")
          bucket[key.trim()] = value.trim()
        })
        buckets.push(bucket)
      }
    }
    return buckets
  }

  private parseBucketView(output: string): BucketInfo {
    if (!output.startsWith("Bucket:")) {
      throw new Error("Unexpected output format for bucket view")
    }
    const bucketInfo = output.substring(8).split(", ")
    const bucket: BucketInfo = {}
    bucketInfo.forEach((info) => {
      const [key, value] = info.split("=")
      bucket[key.trim()] = value.trim()
    })
    return bucket
  }

  private parseBucketDeletion(output: string): { Name: string } {
    if (!output.startsWith("Bucket deleted:")) {
      throw new Error("Unexpected output format for bucket deletion")
    }
    const bucketInfo = output
      .substring("Bucket deleted:".length)
      .trim()
      .split("=")
    if (bucketInfo.length !== 2 || !bucketInfo[0].trim().startsWith("Name")) {
      throw new Error("Invalid bucket deletion output format")
    }

    return {
      Name: bucketInfo[1].trim(),
    }
  }

  private parseFileList(output: string): FileInfo[] {
    const files: FileInfo[] = []
    const lines = output.split("\n")

    for (const line of lines) {
      if (line.startsWith("File:")) {
        const fileInfo = line.substring(6).split(", ")
        const file: FileInfo = {}

        fileInfo.forEach((info) => {
          const [key, value] = info.split("=")
          file[key.trim()] = value.trim()
        })

        files.push(file)
      }
    }

    return files
  }

  private parseFileInfo(output: string): FileInfo {
    if (!output.startsWith("File:")) {
      throw new Error("Unexpected output format for file info")
    }

    const fileInfo = output.substring(6).split(", ")
    const file: FileInfo = {}

    fileInfo.forEach((info) => {
      const [key, value] = info.split("=")
      file[key.trim()] = value.trim()
    })

    return file
  }

  private parseFileUpload(output: string): FileInfo {
    const lines = output.split("\n")
    const successLine = lines.find((line) =>
      line.includes("File uploaded successfully:")
    )

    if (!successLine) {
      throw new Error("File upload failed: " + output)
    }

    const fileInfo = successLine
      .substring(
        successLine.indexOf("File uploaded successfully:") +
          "File uploaded successfully:".length
      )
      .trim()
      .split(", ")

    const result: FileInfo = {}
    fileInfo.forEach((info) => {
      const [key, value] = info.split("=")
      result[key.trim()] = value.trim()
    })

    return result
  }

  private parseFileDownload(output: string): string {
    return output
  }

  // Bucket Operations
  public async createBucket(bucketName: string): Promise<BucketInfo> {
    const args = [
      "ipc",
      "bucket",
      "create",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "createBucket")
  }

  public async deleteBucket(bucketName: string): Promise<{ Name: string }> {
    const args = [
      "ipc",
      "bucket",
      "delete",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "deleteBucket")
  }

  public async viewBucket(bucketName: string): Promise<BucketInfo> {
    const args = [
      "ipc",
      "bucket",
      "view",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "viewBucket")
  }

  public async listBuckets(): Promise<BucketInfo[]> {
    const args = [
      "ipc",
      "bucket",
      "list",
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "listBuckets")
  }

  // File Operations
  public async listFiles(bucketName: string): Promise<FileInfo[]> {
    const args = [
      "ipc",
      "file",
      "list",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "listFiles")
  }

  public async getFileInfo(
    bucketName: string,
    fileName: string
  ): Promise<FileInfo> {
    const args = [
      "ipc",
      "file",
      "info",
      bucketName,
      fileName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "fileInfo")
  }

  public async uploadFile(
    bucketName: string,
    filePath: string
  ): Promise<FileInfo> {
    const args = [
      "ipc",
      "file",
      "upload",
      bucketName,
      filePath,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "uploadFile")
  }

  public async downloadFile(
    bucketName: string,
    fileName: string,
    destinationPath: string
  ): Promise<string> {
    const args = [
      "ipc",
      "file",
      "download",
      bucketName,
      fileName,
      destinationPath,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "downloadFile")
  }
}

export default AkaveIPCClient
