const { spawn } = require("child_process");
const { getLatestTransaction } = require('./web3-utils');
const { privateKeyToAccount } = require('viem/accounts');
const { SDKErrors, ErrorMessages, ErrorHttpStatus } = require('./src/utils/error-codes');
const { logInfo, logError, logDebug } = require('./src/utils/logger');

class AkaveIPCClient {
  constructor(nodeAddress, privateKey) {
    this.nodeAddress = nodeAddress;
    if (privateKey && privateKey.startsWith('0x')) {
      this.privateKey = privateKey.slice(2);
    } else {
      this.privateKey = privateKey;
    }
    this.address = privateKeyToAccount(`0x${this.privateKey}`).address;
  }

  async executeCommand(args, parser = "default", trackTransaction = false) {
    const commandId = Math.random().toString(36).substring(7);
    console.log(`[${commandId}] Executing command: akavecli ${args.join(" ")}`);

    const result = await new Promise((resolve, reject) => {
      const process = spawn("akavecli", args);
      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
        logDebug(commandId, "Command output", { stdout: data.toString().trim() });
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
        if (!data.toString().includes('File uploaded successfully:')) {
          logError(commandId, "Command error output", { stderr: data.toString().trim() });
        }
      });

      process.on("close", (code) => {
        const output = (stdout + stderr).trim();

        // Check for SDK errors in stderr
        if (stderr) {
          // Extract error code if present in stderr
          const hexCodeMatch = stderr.match(/0x[a-fA-F0-9]{8}/);
          if (hexCodeMatch) {
            const errorCode = hexCodeMatch[0];
            const error = this.createAkaveError(
              errorCode,
              ErrorMessages[errorCode],
              new Error(stderr)
            );
            reject(error);
            return;
          }

          // Check for specific error messages in stderr
          if (stderr.includes('BucketNonempty')) {
            const error = this.createAkaveError(
              SDKErrors.BUCKET_NONEMPTY,
              ErrorMessages[SDKErrors.BUCKET_NONEMPTY],
              new Error(stderr)
            );
            reject(error);
            return;
          }

          if (stderr.includes('FileFullyUploaded')) {
            const error = this.createAkaveError(
              SDKErrors.FILE_FULLY_UPLOADED,
              ErrorMessages[SDKErrors.FILE_FULLY_UPLOADED],
              new Error(stderr)
            );
            reject(error);
            return;
          }
        }

        if (code === 0) {
          logInfo(commandId, "Command completed successfully");
          try {
            const result = this.parseOutput(output, parser);
            resolve(result);
          } catch (error) {
            console.error(`[${commandId}] Failed to parse output:`, error.message);
            reject(this.handleError(error, output));
          }
        } else {
          logError(commandId, "Command failed", { code });
          reject(this.handleError(new Error(stderr || output), output));
        }
      });

      process.on("error", (err) => {
        logError(commandId, "Process error", err);
        const handledError = this.handleError(err);
        reject(handledError);
      });
    });

    if (trackTransaction) {
      logInfo(commandId, "Fetching transaction hash");
      try {
        console.log(`[${commandId}] Fetching transaction hash...`);
        const txHash = await getLatestTransaction(this.address);

        if (txHash) {
          console.log(`[${commandId}] Transaction hash found: ${txHash}`);
          return { ...result, transactionHash: txHash };
        } else {
          console.warn(`[${commandId}] No transaction hash found`);
          return result;
        }
      } catch (error) {
        console.error(`[${commandId}] Failed to get transaction hash:`, error);
        return result;
      }
    }

    return result;
  }

  createAkaveError(code, message, originalError = null, validationDetails = null) {
    const error = new Error(message);
    error.name = 'AkaveError';
    error.code = code;
    error.status = ErrorHttpStatus[code] || HttpStatus.INTERNAL_SERVER_ERROR;
    error.originalError = originalError;
    error.timestamp = new Date();

    if (validationDetails) {
      error.details = validationDetails;
    }

    if (originalError && originalError.stack) {
      error.stack = originalError.stack;
    }

    return error;
  }

  handleError(error, output = '') {
    // First check if it's already an AkaveError
    if (error.name === 'AkaveError') {
      return error;
    }

    // Check for specific error strings
    if (error.message.includes('BucketNonempty')) {
      return this.createAkaveError(
        SDKErrors.BUCKET_NONEMPTY,
        ErrorMessages[SDKErrors.BUCKET_NONEMPTY],
        error
      );
    }

    if (error.message.includes('FileFullyUploaded')) {
      return this.createAkaveError(
        SDKErrors.FILE_FULLY_UPLOADED,
        ErrorMessages[SDKErrors.FILE_FULLY_UPLOADED],
        error
      );
    }

    // Handle validation errors
    if (error.code === 'VALIDATION_ERROR') {
      return error;
    }

    // Check for hex codes in error message
    const hexCodeMatch = error.message.match(/0x[a-fA-F0-9]{8}/);
    if (hexCodeMatch) {
      const errorCode = hexCodeMatch[0];
      return this.createAkaveError(
        errorCode,
        ErrorMessages[errorCode] || 'Unknown SDK error',
        error
      );
    }

    // Handle parsing errors
    if (error.message.includes("Unexpected output format") ||
      error.message.includes("Failed to parse output")) {
      return this.createAkaveError(
        SDKErrors.BUCKET_INVALID,
        ErrorMessages[SDKErrors.BUCKET_INVALID],
        error
      );
    }

    // Handle system/runtime errors
    if (error.code === 'ENOENT') {
      return this.createAkaveError(
        'SYSTEM_ERROR',
        'Command not found: akavecli. Please ensure it is installed correctly.',
        error
      );
    }

    // Default case
    return this.createAkaveError(
      'UNKNOWN_ERROR',
      error.message || 'An unexpected error occurred',
      error
    );
  }

  parseOutput(output, parser) {
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
    // Check for empty output
    if (!output || !output.trim()) {
      throw this.createAkaveError(
        SDKErrors.BUCKET_INVALID,
        ErrorMessages[SDKErrors.BUCKET_INVALID],
        new Error('Empty response')
      );
    }

    // Check for correct output format
    if (!output.startsWith("Bucket created:")) {
      throw this.createAkaveError(
        SDKErrors.BUCKET_INVALID,
        ErrorMessages[SDKErrors.BUCKET_INVALID],
        new Error('Invalid response format')
      );
    }

    try {
      const bucketInfo = output
        .substring("Bucket created:".length)
        .trim()
        .split(", ");
      const bucket = {};
      bucketInfo.forEach((info) => {
        const [key, value] = info.split("=");
        if (!key || !value) {
          throw this.createAkaveError(
            SDKErrors.BUCKET_INVALID,
            ErrorMessages[SDKErrors.BUCKET_INVALID],
            new Error('Invalid bucket info format')
          );
        }
        bucket[key.trim()] = value.trim();
      });
      return bucket;
    } catch (error) {
      // If error is already an AkaveError, rethrow it
      if (error.name === 'AkaveError') {
        throw error;
      }
      // Otherwise wrap it in an AkaveError
      throw this.createAkaveError(
        SDKErrors.BUCKET_INVALID,
        ErrorMessages[SDKErrors.BUCKET_INVALID],
        error
      );
    }
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
    if (output.includes('BucketNonempty')) {
      throw this.createAkaveError(
        SDKErrors.BUCKET_NONEMPTY,
        ErrorMessages[SDKErrors.BUCKET_NONEMPTY],
        new Error(output)
      );
    }

    // For successful deletion
    if (!output.startsWith('Bucket deleted:')) {
      throw this.createAkaveError(
        SDKErrors.BUCKET_INVALID,
        ErrorMessages[SDKErrors.BUCKET_INVALID],
        new Error('Invalid response format')
      );
    }

    return { message: 'Bucket deleted successfully' };
  }

  parseFileList(output) {
    const files = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.startsWith('File:')) {
        const fileInfo = line.substring(6).split(', ');
        const file = {};

        fileInfo.forEach(info => {
          const [key, value] = info.split('=');
          file[key.trim()] = value.trim();
        });

        files.push(file);
      }
    }

    return files;
  }

  parseFileInfo(output) {
    if (!output.startsWith('File:')) {
      throw new Error('Unexpected output format for file info');
    }

    const fileInfo = output.substring(6).split(', ');
    const file = {};

    fileInfo.forEach(info => {
      const [key, value] = info.split('=');
      file[key.trim()] = value.trim();
    });

    return file;
  }

  parseFileUpload(output) {
    if (output.includes('FileFullyUploaded')) {
      throw this.createAkaveError(
        SDKErrors.FILE_FULLY_UPLOADED,
        ErrorMessages[SDKErrors.FILE_FULLY_UPLOADED],
        new Error(output)
      );
    }

    const lines = output.split('\n');
    const successLine = lines.find(line => line.includes('File uploaded successfully:'));

    if (!successLine) {
      throw new Error('File upload failed: ' + output);
    }

    const fileInfo = successLine
      .substring(successLine.indexOf('File uploaded successfully:') + 'File uploaded successfully:'.length)
      .trim()
      .split(', ');

    const result = {};
    fileInfo.forEach(info => {
      const [key, value] = info.split('=');
      result[key.trim()] = value.trim();
    });

    return result;
  }

  parseFileDownload(output) {
    return output;
  }

  async createBucket(bucketName) {
    const validationError = this.validateInput('bucket', { bucketName });
    if (validationError) {
      throw validationError;
    }

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

  validateInput(type, params) {
    switch (type) {
      case 'bucket': {
        const { bucketName } = params;
        if (!bucketName || typeof bucketName !== 'string' || !bucketName.trim()) {
          return this.createAkaveError(
            'VALIDATION_ERROR',
            'Invalid bucket name',
            null,
            {
              field: 'bucketName',
              type: 'required'
            }
          );
        }
        return null;
      }
      case 'file': {
        const { bucketName, fileName } = params;
        const errors = [];

        if (!bucketName || typeof bucketName !== 'string' || !bucketName.trim()) {
          errors.push({
            field: 'bucketName',
            type: 'required'
          });
        }
        if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
          errors.push({
            field: 'fileName',
            type: 'required'
          });
        }

        if (errors.length > 0) {
          return this.createAkaveError(
            'VALIDATION_ERROR',
            'Invalid input parameters',
            null,
            errors
          );
        }
        return null;
      }
      default:
        return null;
    }
  }
}

module.exports = AkaveIPCClient;
