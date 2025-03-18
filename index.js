const { spawn } = require("child_process");
const { privateKeyToAccount } = require("viem/accounts");
const logger = require("./logger");

class AkaveIPCClient {
  constructor(nodeAddress, privateKey) {
    this.nodeAddress = nodeAddress;
    if (privateKey && privateKey.startsWith("0x")) {
      this.privateKey = privateKey.slice(2);
    } else {
      this.privateKey = privateKey;
    }
    this.address = privateKeyToAccount(`0x${this.privateKey}`).address;
  }

  async executeCommand(args, parser = "default") {
    const commandId = Math.random().toString(36).substring(7);
    logger.info(`Executing ${args[1]} ${args[2]} command`, { commandId });

    const result = await new Promise((resolve, reject) => {
      const process = spawn("akavecli", args);
      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
        logger.debug(`Command output`, {
          commandId,
          output: data.toString().trim(),
        });
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
        // Only log if it's actually an error
        if (!data.toString().includes("File uploaded successfully:")) {
          logger.debug(`Command output from stderr`, {
            commandId,
            output: data.toString().trim(),
          });
        }
      });

      process.on("close", (code) => {
        const output = (stdout + stderr).trim();

        if (code === 0) {
          logger.info(`Command completed successfully`, { commandId });
        } else {
          logger.error(`Command failed with code: ${code}`, { commandId });
        }

        try {
          const result = this.parseOutput(output, parser);
          resolve(result);
        } catch (error) {
          logger.error(`Failed to parse output`, {
            commandId,
            error: error.message,
          });
          reject(error);
        }
      });

      process.on("error", (err) => {
        logger.error(`Process error`, {
          commandId,
          error: err.message,
        });
        reject(err);
      });
    });


    return result;
  }

  parseOutput(output, parser) {
    // Try JSON first for error messages
    try {
      return JSON.parse(output);
    } catch (e) {
      // Not JSON, continue with specific parsers
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

  parseBucketCreation(output) {
    if (!output.startsWith("Bucket created:")) {
      throw new Error("Unexpected output format for bucket creation");
    }
    const bucketInfo = output
      .substring("Bucket created:".length)
      .trim()
      .split(", ");
    const bucket = {};
    bucketInfo.forEach((info) => {
      const [key, value] = info.split("=");
      bucket[key.trim()] = value.trim();
    });
    return bucket;
  }

  parseBucketList(output) {
    const buckets = [];
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.startsWith("Bucket:")) {
        const bucketInfo = line.substring(8).split(", ");
        const bucket = {};
        bucketInfo.forEach((info) => {
          const [key, value] = info.split("=");
          bucket[key.trim()] = value.trim();
        });
        buckets.push(bucket);
      }
    }
    return buckets;
  }

  parseBucketView(output) {
    if (!output.startsWith("Bucket:")) {
      throw new Error("Unexpected output format for bucket view");
    }
    const bucketInfo = output.substring(8).split(", ");
    const bucket = {};
    bucketInfo.forEach((info) => {
      const [key, value] = info.split("=");
      bucket[key.trim()] = value.trim();
    });
    return bucket;
  }

  parseBucketDeletion(output) {
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
      Name: bucketInfo[1].trim(),
    };
  }

  parseFileList(output) {
    const files = [];
    const lines = output.split("\n");

    for (const line of lines) {
      if (line.startsWith("File:")) {
        const fileInfo = line.substring(6).split(", ");
        const file = {};

        fileInfo.forEach((info) => {
          const [key, value] = info.split("=");
          file[key.trim()] = value.trim();
        });

        files.push(file);
      }
    }

    return files;
  }

  parseFileInfo(output) {
    if (!output.startsWith("File:")) {
      throw new Error("Unexpected output format for file info");
    }

    const fileInfo = output.substring(6).split(", ");
    const file = {};

    fileInfo.forEach((info) => {
      const [key, value] = info.split("=");
      file[key.trim()] = value.trim();
    });

    return file;
  }

  parseFileUpload(output) {
    // Split output into lines and find the success message
    const lines = output.split("\n");
    const successLine = lines.find((line) =>
      line.includes("File uploaded successfully:")
    );

    if (!successLine) {
      throw new Error("File upload failed: " + output);
    }

    const fileInfo = successLine
      .substring(
        successLine.indexOf("File uploaded successfully:") +
          "File uploaded successfully:".length
      )
      .trim()
      .split(", ");

    const result = {};
    fileInfo.forEach((info) => {
      const [key, value] = info.split("=");
      result[key.trim()] = value.trim();
    });

    return result;
  }

  parseFileDownload(output) {
    // For download, we don't need to parse the output
    // The actual file content is streamed directly to the response
    // This parser is only called for error cases
    return output;
  }

  // Bucket Operations
  async createBucket(bucketName) {
    const args = [
      "ipc",
      "bucket",
      "create",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "createBucket", true);
  }

  async deleteBucket(bucketName) {
    const args = [
      "ipc",
      "bucket",
      "delete",
      bucketName,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "deleteBucket", true);
  }

  async viewBucket(bucketName) {
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

  async listBuckets() {
    const args = [
      "ipc",
      "bucket",
      "list",
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "listBuckets");
  }

  // File Operations
  async listFiles(bucketName) {
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

  async getFileInfo(bucketName, fileName) {
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

  async uploadFile(bucketName, filePath) {
    const args = [
      "ipc",
      "file",
      "upload",
      bucketName,
      filePath,
      `--node-address=${this.nodeAddress}`,
      `--private-key=${this.privateKey}`,
    ];
    return this.executeCommand(args, "uploadFile", true);
  }

  async downloadFile(bucketName, fileName, destinationPath) {
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
    return this.executeCommand(args, "downloadFile");
  }
}

module.exports = AkaveIPCClient;
