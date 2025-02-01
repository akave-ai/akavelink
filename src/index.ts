import { spawn } from "child_process";
import { getLatestTransaction } from './web3-utils';
import { privateKeyToAccount } from 'viem/accounts';
import {
  AkaveIPCClientConfig,
  BucketInfo,
  FileInfo,
  ParserType,
  CommandResult
} from './types/types';

interface UploadOptions {
  contentType?: string;
  visibility?: 'public' | 'private';
  tags?: Record<string, string>;
}

class AkaveIPCClient {
  private nodeAddress: string;
  private privateKey: string;
  private address: string;

  constructor({ nodeAddress, privateKey }: AkaveIPCClientConfig) {
    this.nodeAddress = nodeAddress;
    this.privateKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    this.address = privateKeyToAccount(`0x${this.privateKey}`).address;
  }

  private async executeCommand<T>(
    args: string[], 
    parser: ParserType = "default", 
    trackTransaction = false
  ): Promise<CommandResult<T>> {
    const commandId = Math.random().toString(36).substring(7);
    console.log(`[${commandId}] Executing command: akavecli ${args.join(" ")}`);

    const result = await new Promise<T>((resolve, reject) => {
      const process = spawn("akavecli", args);
      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
        console.log(`[${commandId}] stdout: ${data.toString().trim()}`);
      });

      process.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
        if (!data.toString().includes('File uploaded successfully:')) {
          console.error(`[${commandId}] stderr: ${data.toString().trim()}`);
        }
      });

      process.on("close", (code: number) => {
        const output = (stdout + stderr).trim();
        
        if (code === 0) {
          console.log(`[${commandId}] Command completed successfully`);
        } else {
          console.error(`[${commandId}] Command failed with code: ${code}`);
        }

        try {
          const result = this.parseOutput(output, parser);
          resolve(result as T);
        } catch (error) {
          console.error(`[${commandId}] Failed to parse output:`, error);
          reject(error);
        }
      });

      process.on("error", (err: Error) => {
        console.error(`[${commandId}] Process error:`, err);
        reject(err);
      });
    });

    if (trackTransaction) {
      try {
        console.log(`[${commandId}] Fetching transaction hash...`);
        const txHash = await getLatestTransaction(this.address, commandId);
        
        if (txHash) {
          console.log(`[${commandId}] Transaction hash found: ${txHash}`);
          return { data: result, transactionHash: txHash };
        }
        console.warn(`[${commandId}] No transaction hash found`);
      } catch (error) {
        console.error(`[${commandId}] Failed to get transaction hash:`, error);
      }
    }

    return { data: result };
  }

  private parseOutput<T>(output: string, parser: ParserType): T {
    // Try JSON first for error messages
    try {
      return JSON.parse(output) as T;
    } catch (e) {
      // Not JSON, continue with specific parsers
    }

    switch (parser) {
      case "createBucket":
        return this.parseBucketCreation(output) as T;
      case "listBuckets":
        return this.parseBucketList(output) as T;
      case "viewBucket":
        return this.parseBucketView(output) as T;
      case "deleteBucket":
        return this.parseBucketDeletion(output) as T;
      case "listFiles":
        return this.parseFileList(output) as T;
      case "fileInfo":
        return this.parseFileInfo(output) as T;
      case "uploadFile":
        return this.parseFileUpload(output) as T;
      case "downloadFile":
        return this.parseFileDownload(output) as T;
      default:
        return output as T;
    }
  }

  private parseBucketCreation(output: string): BucketInfo {
    if (!output.startsWith("Bucket created:")) {
      throw new Error("Unexpected output format for bucket creation");
    }
    const bucketInfo = output
      .substring("Bucket created:".length)
      .trim()
      .split(", ");
    const bucket: Partial<BucketInfo> = {};
    bucketInfo.forEach((info) => {
      const [key, value] = info.split("=");
      bucket[key.trim() as keyof BucketInfo] = value.trim();
    });
    return bucket as BucketInfo;
  }

  private parseBucketList(output: string): BucketInfo[] {
    const buckets: BucketInfo[] = [];
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.startsWith("Bucket:")) {
        const bucketInfo = line.substring(8).split(", ");
        const bucket: Partial<BucketInfo> = {};
        bucketInfo.forEach((info) => {
          const [key, value] = info.split("=");
          bucket[key.trim() as keyof BucketInfo] = value.trim();
        });
        buckets.push(bucket as BucketInfo);
      }
    }
    return buckets;
  }

  private parseBucketView(output: string): BucketInfo {
    if (!output.startsWith("Bucket:")) {
      throw new Error("Unexpected output format for bucket view");
    }
    const bucketInfo = output.substring(8).split(", ");
    const bucket: Partial<BucketInfo> = {};
    bucketInfo.forEach((info) => {
      const [key, value] = info.split("=");
      bucket[key.trim() as keyof BucketInfo] = value.trim();
    });
    return bucket as BucketInfo;
  }

  private parseBucketDeletion(output: string): BucketInfo {
    if (!output.startsWith("Bucket deleted:")) {
      throw new Error("Unexpected output format for bucket deletion");
    }
    const bucketInfo = output
      .substring("Bucket deleted:".length)
      .trim()
      .split("=");
    if (bucketInfo.length !== 2 || !bucketInfo[0].trim().startsWith("Name")) {
      throw new Error("Invalid bucket deletion output format");
    }

    return {
      Name: bucketInfo[1].trim()
    };
  }

  private parseFileList(output: string): FileInfo[] {
    const files: FileInfo[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('File:')) {
        const fileInfo = line.substring(6).split(', ');
        const file: Partial<FileInfo> = {};
        
        fileInfo.forEach(info => {
          const [key, value] = info.split('=');
          file[key.trim() as keyof FileInfo] = value.trim();
        });
        
        files.push(file as FileInfo);
      }
    }
    
    return files;
  }

  private parseFileInfo(output: string): FileInfo {
    if (!output.startsWith('File:')) {
      throw new Error('Unexpected output format for file info');
    }
    
    const fileInfo = output.substring(6).split(', ');
    const file: Partial<FileInfo> = {};
    
    fileInfo.forEach(info => {
      const [key, value] = info.split('=');
      file[key.trim() as keyof FileInfo] = value.trim();
    });
    
    return file as FileInfo;
  }

  private parseFileUpload(output: string): FileInfo {
    const lines = output.split('\n');
    const successLine = lines.find(line => line.includes('File uploaded successfully:'));
    
    if (!successLine) {
      throw new Error('File upload failed: ' + output);
    }
    
    const fileInfo = successLine
      .substring(successLine.indexOf('File uploaded successfully:') + 'File uploaded successfully:'.length)
      .trim()
      .split(', ');
    
    const result: Partial<FileInfo> = {};
    fileInfo.forEach(info => {
      const [key, value] = info.split('=');
      result[key.trim() as keyof FileInfo] = value.trim();
    });
    
    return result as FileInfo;
  }

  private parseFileDownload(output: string): string {
    // For download, we don't need to parse the output
    // The actual file content is streamed directly to the response
    // This parser is only called for error cases
    return output;
  }


  // Bucket Operations
  async createBucket(bucketName: string): Promise<CommandResult<BucketInfo>> {
    const args = [
      "ipc",
      "bucket",
      "create",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand<BucketInfo>(args, "createBucket", true);
  }

  async deleteBucket(bucketName: string): Promise<CommandResult<BucketInfo>> {
    const args = [
      "ipc",
      "bucket",
      "delete",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand<BucketInfo>(args, "deleteBucket", true);
  }

  async viewBucket(bucketName: string): Promise<CommandResult<BucketInfo>> {
    const args = [
      "ipc",
      "bucket",
      "view",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand<BucketInfo>(args, "viewBucket");
  }

  async listBuckets(): Promise<CommandResult<BucketInfo[]>> {
    const args = [
      "ipc",
      "bucket",
      "list",
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand<BucketInfo[]>(args, "listBuckets");
  }

  // File Operations
  async listFiles(bucketName: string): Promise<CommandResult<FileInfo[]>> {
    const args = [
      "ipc",
      "file",
      "list",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand<FileInfo[]>(args, "listFiles");
  }

  async getFileInfo(bucketName: string, fileName: string): Promise<CommandResult<FileInfo>> {
    const args = [
      "ipc",
      "file",
      "info",
      bucketName,
      fileName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand<FileInfo>(args, "fileInfo");
  }


  async uploadFile(bucketName: string, filePath: string, options: UploadOptions = {}): Promise<CommandResult<FileInfo>> {
    const args = [
      "ipc",
      "file",
      "upload",
      bucketName,
      filePath,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];

    if (options.contentType) {
      args.push(`--content-type=${options.contentType}`);
    }
    if (options.visibility) {
      args.push(`--visibility=${options.visibility}`);
    }
    if (options.tags) {
      const tags = Object.entries(options.tags)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
      args.push(`--tags=${tags}`);
    }

    return this.executeCommand<FileInfo>(args, "uploadFile", true);
  }

  async downloadFile(bucketName: string, fileName: string, destinationPath: string): Promise<CommandResult<string>> {
    const args = [
      "ipc",
      "file",
      "download",
      bucketName,
      fileName,
      destinationPath,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand<string>(args, "downloadFile");
  }
}

export default AkaveIPCClient;