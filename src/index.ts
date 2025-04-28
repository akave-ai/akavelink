import { spawn } from "child_process"
import { getLatestTransaction } from "./web3-utils"
import { privateKeyToAccount } from "viem/accounts"
import { Bucket, File, UploadResult, ClientConfig, AkaveError } from "./types"

interface ParsedOutput {
  [key: string]: string | number
}

class AkaveIPCClient {
  private nodeAddress: string
  private privateKey: string
  private address: string

  constructor({ nodeAddress, privateKey }: ClientConfig) {
    this.nodeAddress = nodeAddress
    this.privateKey = privateKey.startsWith("0x")
      ? privateKey.slice(2)
      : privateKey
    this.address = privateKeyToAccount(`0x${this.privateKey}`).address
  }

  private async executeCommand<T>(
    args: string[],
    parser: keyof typeof this.parsers = "default",
    trackTransaction = false
  ): Promise<T> {
    const commandId = Math.random().toString(36).substring(7)
    console.log(`[${commandId}] Executing command: akavecli ${args.join(" ")}`)

    const result = await new Promise<T>((resolve, reject) => {
      const process = spawn("akavecli", args)
      let stdout = ""
      let stderr = ""

      process.stdout.on("data", (data: Buffer) => {
        stdout += data.toString()
        console.log(`[${commandId}] stdout: ${data.toString().trim()}`)
      })

      process.stderr.on("data", (data: Buffer) => {
        stderr += data.toString()
        if (!data.toString().includes("File uploaded successfully:")) {
          console.error(`[${commandId}] stderr: ${data.toString().trim()}`)
        }
      })

      process.on("close", (code: number) => {
        const output = (stdout + stderr).trim()

        if (code === 0) {
          console.log(`[${commandId}] Command completed successfully`)
        } else {
          console.error(`[${commandId}] Command failed with code: ${code}`)
        }

        try {
          const result = this.parsers[parser](output)
          resolve(result as T)
        } catch (error) {
          console.error(
            `[${commandId}] Failed to parse output:`,
            error instanceof Error ? error.message : error
          )
          reject(error)
        }
      })

      process.on("error", (err: Error) => {
        console.error(`[${commandId}] Process error:`, err)
        reject(err)
      })
    })

    if (trackTransaction) {
      try {
        console.log(`[${commandId}] Fetching transaction hash...`)
        const txHash = await getLatestTransaction(this.address, commandId)

        if (txHash) {
          console.log(`[${commandId}] Transaction hash found: ${txHash}`)
          return { ...result, transactionHash: txHash } as T
        }
        console.warn(`[${commandId}] No transaction hash found`)
      } catch (error) {
        console.error(`[${commandId}] Failed to get transaction hash:`, error)
      }
    }

    return result
  }

  private parsers = {
    createBucket: (output: string): Bucket => {
      if (!output.startsWith("Bucket created:")) {
        throw new AkaveError("Unexpected output format for bucket creation")
      }
      return this.parseKeyValuePairs(
        output.substring("Bucket created:".length)
      ) as unknown as Bucket
    },

    listBuckets: (output: string): Bucket[] => {
      const buckets: Bucket[] = []
      const lines = output.split("\n")
      for (const line of lines) {
        if (line.startsWith("Bucket:")) {
          buckets.push(
            this.parseKeyValuePairs(line.substring(8)) as unknown as Bucket
          )
        }
      }
      return buckets
    },

    viewBucket: (output: string): Bucket => {
      if (!output.startsWith("Bucket:")) {
        throw new AkaveError("Unexpected output format for bucket view")
      }
      return this.parseKeyValuePairs(output.substring(8)) as unknown as Bucket
    },

    deleteBucket: (output: string): { Name: string } => {
      if (!output.startsWith("Bucket deleted:")) {
        throw new AkaveError("Unexpected output format for bucket deletion")
      }
      const bucketInfo = output
        .substring("Bucket deleted:".length)
        .trim()
        .split("=")
      if (bucketInfo.length !== 2 || !bucketInfo[0].trim().startsWith("Name")) {
        throw new AkaveError("Invalid bucket deletion output format")
      }
      return { Name: bucketInfo[1].trim() }
    },

    listFiles: (output: string): File[] => {
      const files: File[] = []
      const lines = output.split("\n")
      for (const line of lines) {
        if (line.startsWith("File:")) {
          files.push(
            this.parseKeyValuePairs(line.substring(6)) as unknown as File
          )
        }
      }
      return files
    },

    fileInfo: (output: string): File => {
      if (!output.startsWith("File:")) {
        throw new AkaveError("Unexpected output format for file info")
      }
      return this.parseKeyValuePairs(output.substring(6)) as unknown as File
    },

    uploadFile: (output: string): UploadResult => {
      const lines = output.split("\n")
      const successLine = lines.find((line) =>
        line.includes("File uploaded successfully:")
      )

      if (!successLine) {
        throw new AkaveError("File upload failed: " + output)
      }

      return this.parseKeyValuePairs(
        successLine.substring(
          successLine.indexOf("File uploaded successfully:") +
            "File uploaded successfully:".length
        )
      ) as unknown as UploadResult
    },

    downloadFile: (output: string): string => output,

    default: (output: string): unknown => {
      try {
        return JSON.parse(output)
      } catch {
        return output
      }
    },
  } as const

  private parseKeyValuePairs(input: string): ParsedOutput {
    const result: ParsedOutput = {}
    const pairs = input.trim().split(", ")
    pairs.forEach((pair) => {
      const [key, value] = pair.split("=")
      result[key.trim()] = value.trim()
    })
    return result
  }

  // Public methods
  async createBucket(bucketName: string): Promise<Bucket> {
    const args = [
      "ipc",
      "bucket",
      "create",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "createBucket", true)
  }

  async deleteBucket(bucketName: string): Promise<{ Name: string }> {
    const args = [
      "ipc",
      "bucket",
      "delete",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "deleteBucket", true)
  }

  async viewBucket(bucketName: string): Promise<Bucket> {
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

  async listBuckets(): Promise<Bucket[]> {
    const args = [
      "ipc",
      "bucket",
      "list",
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "listBuckets")
  }

  async listFiles(bucketName: string): Promise<File[]> {
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

  async getFileInfo(bucketName: string, fileName: string): Promise<File> {
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

  async uploadFile(
    bucketName: string,
    filePath: string
  ): Promise<UploadResult> {
    const args = [
      "ipc",
      "file",
      "upload",
      bucketName,
      filePath,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ]
    return this.executeCommand(args, "uploadFile", true)
  }

  async downloadFile(
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
