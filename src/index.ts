import { spawn } from "child_process";
import { privateKeyToAccount } from "viem/accounts";
import logger from "./logger";

// Types for parsed bucket or file info
type InfoMap = Record<string, string>;

class AkaveIPCClient {
  private nodeAddress: string;
  private privateKey: string;
  public address: string;

  constructor(nodeAddress: string, privateKey?: string) {
    this.nodeAddress = nodeAddress;

    if (privateKey?.startsWith("0x")) {
      this.privateKey = privateKey.slice(2);
    } else {
      this.privateKey = privateKey ?? "";
    }

    this.address = privateKeyToAccount(`0x${this.privateKey}`).address;
  }

  private async executeCommand(
    args: string[],
    parser: string = "default"
  ): Promise<any> {
    const commandId = Math.random().toString(36).substring(7);
    logger.info(`Executing ${args[1]} ${args[2]} command`, { commandId });

    return new Promise((resolve, reject) => {
      const process = spawn("akavecli", args);
      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        logger.debug(`Command output`, { commandId, output: output.trim() });
      });

      process.stderr.on("data", (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        if (!output.includes("File uploaded successfully:")) {
          logger.debug(`Command stderr output`, {
            commandId,
            output: output.trim(),
          });
        }
      });

      process.on("close", (code: number) => {
        const output = (stdout + stderr).trim();

        if (code === 0) {
          logger.info(`Command completed successfully`, { commandId });
        } else {
          logger.error(`Command failed with code: ${code}`, { commandId });
        }

        try {
          const result = this.parseOutput(output, parser);
          resolve(result);
        } catch (error: any) {
          logger.error(`Failed to parse output`, {
            commandId,
            error: error.message,
          });
          reject(error);
        }
      });

      process.on("error", (err: Error) => {
        logger.error(`Process error`, { commandId, error: err.message });
        reject(err);
      });
    });
  }

  private parseOutput(output: string, parser: string): any {
    try {
      return JSON.parse(output);
    } catch {
      // not JSON; continue
    }

    switch (parser) {
      case "createBucket":
        return this.parseBucketCreation(output);
      case "listBuckets":
        return this.parseBucketList(output);
      case "viewBucket":
        return this.parseBucketView(output);
      case "deleteBucket":
        return this.parseBucketDeletion(output);
      case "listFiles":
        return this.parseFileList(output);
      case "fileInfo":
        return this.parseFileInfo(output);
      case "uploadFile":
        return this.parseFileUpload(output);
      case "downloadFile":
        return this.parseFileDownload(output);
      default:
        return output;
    }
  }

  private parseKeyValuePairs(line: string): InfoMap {
    const obj: InfoMap = {};
    line.split(", ").forEach((pair) => {
      const [key, value] = pair.split("=");
      obj[key.trim()] = value?.trim() ?? "";
    });
    return obj;
  }

  private parseBucketCreation(output: string): InfoMap {
    if (!output.startsWith("Bucket created:")) {
      throw new Error("Unexpected output format for bucket creation");
    }
    return this.parseKeyValuePairs(
      output.replace("Bucket created:", "").trim()
    );
  }

  private parseBucketList(output: string): InfoMap[] {
    return output
      .split("\n")
      .filter((line) => line.startsWith("Bucket:"))
      .map((line) => this.parseKeyValuePairs(line.substring(8)));
  }

  private parseBucketView(output: string): InfoMap {
    if (!output.startsWith("Bucket:")) {
      throw new Error("Unexpected output format for bucket view");
    }
    return this.parseKeyValuePairs(output.substring(8));
  }

  private parseBucketDeletion(output: string): InfoMap {
    if (!output.startsWith("Bucket deleted:")) {
      throw new Error("Unexpected output format for bucket deletion");
    }

    const parts = output.substring("Bucket deleted:".length).trim().split("=");
    if (parts.length !== 2 || !parts[0].trim().startsWith("Name")) {
      throw new Error("Invalid bucket deletion output format");
    }

    return { Name: parts[1].trim() };
  }

  private parseFileList(output: string): InfoMap[] {
    return output
      .split("\n")
      .filter((line) => line.startsWith("File:"))
      .map((line) => this.parseKeyValuePairs(line.substring(6)));
  }

  private parseFileInfo(output: string): InfoMap {
    if (!output.startsWith("File:")) {
      throw new Error("Unexpected output format for file info");
    }
    return this.parseKeyValuePairs(output.substring(6));
  }

  private parseFileUpload(output: string): InfoMap {
    const lines = output.split("\n");
    const line = lines.find((l) => l.includes("File uploaded successfully:"));
    if (!line) throw new Error("File upload failed: " + output);

    return this.parseKeyValuePairs(
      line.substring(line.indexOf(":") + 1).trim()
    );
  }

  private parseFileDownload(output: string): string {
    // File streamed directly; output is only used for errors
    return output;
  }

  // Bucket Commands
  async createBucket(bucketName: string): Promise<InfoMap> {
    const args = [
      "ipc",
      "bucket",
      "create",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "createBucket");
  }

  async deleteBucket(bucketName: string): Promise<InfoMap> {
    const args = [
      "ipc",
      "bucket",
      "delete",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "deleteBucket");
  }

  async viewBucket(bucketName: string): Promise<InfoMap> {
    const args = [
      "ipc",
      "bucket",
      "view",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "viewBucket");
  }

  async listBuckets(): Promise<InfoMap[]> {
    const args = [
      "ipc",
      "bucket",
      "list",
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "listBuckets");
  }

  // File Commands
  async listFiles(bucketName: string): Promise<InfoMap[]> {
    const args = [
      "ipc",
      "file",
      "list",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "listFiles");
  }

  async getFileInfo(bucketName: string, fileName: string): Promise<InfoMap> {
    const args = [
      "ipc",
      "file",
      "info",
      bucketName,
      fileName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "fileInfo");
  }

  async uploadFile(
    bucketName: string,
    filePath: string,
    options?: { fileName?: string; cleanup?: boolean }
  ): Promise<InfoMap> {
    const args = [
      "ipc",
      "file",
      "upload",
      bucketName,
      filePath,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "uploadFile");
  }

  async downloadFile(
    bucketName: string,
    fileName: string,
    destination: string
  ): Promise<string> {
    const args = [
      "ipc",
      "file",
      "download",
      bucketName,
      fileName,
      destination,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "downloadFile");
  }
}

export default AkaveIPCClient;
