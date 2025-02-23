const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const FormData = require("form-data");
const path = require("path");
const { SDKErrors, ErrorMessages } = require("../../src/utils/error-codes");

const API_BASE_URL = process.env.API_URL || "http://localhost:8000";
const TEST_TIMEOUT = 30000; // 30 seconds
const CLEANUP_TIMEOUT = 10000; // 10 seconds

describe("Bucket Operations", () => {
  let bucketName;
  let tempFileName;
  let tempFilePath;
  let testFilesDir;

  beforeAll(() => {
    testFilesDir = path.join(process.cwd(), "test-files");
    if (!fs.existsSync(testFilesDir)) {
      fs.mkdirSync(testFilesDir, { recursive: true });
    }
  });

  beforeEach(() => {
    bucketName = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  });

  test(
    "should create a new bucket",
    async () => {
      const response = await axios.post(`${API_BASE_URL}/buckets`, {
        bucketName,
      });
      expect(response.data.success).toBe(true);
      expect(response.data.data.Name).toBe(bucketName);
    },
    TEST_TIMEOUT
  );

  test(
    "should list buckets",
    async () => {
      const response = await axios.get(`${API_BASE_URL}/buckets`);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
      expect(
        response.data.data.some((bucket) => bucket.Name === bucketName)
      ).toBe(true);
    },
    TEST_TIMEOUT
  );

  test(
    "should upload and download file",
    async () => {
      // Create test file
      tempFileName = `test_${Date.now()}_${uuidv4().replace(/-/g, "_")}.bin`;
      tempFilePath = path.join(testFilesDir, tempFileName);

      // Create test file with random data
      fs.writeFileSync(tempFilePath, crypto.randomBytes(1024));

      // Upload
      const form = new FormData();
      form.append("file", fs.createReadStream(tempFilePath));

      const uploadResponse = await axios.post(
        `${API_BASE_URL}/buckets/${bucketName}/files`,
        form,
        {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );
      expect(uploadResponse.data.success).toBe(true);

      // Wait a bit for the file to be available
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Download and verify
      const downloadResponse = await axios.get(
        `${API_BASE_URL}/buckets/${bucketName}/files/${tempFileName}/download`,
        { responseType: "arraybuffer" }
      );

      const downloadedContent = Buffer.from(downloadResponse.data);
      const originalContent = fs.readFileSync(tempFilePath);
      expect(downloadedContent).toEqual(originalContent);
    },
    TEST_TIMEOUT
  );

  describe("Error Handling for Bucket Operations", () => {
    let errorBucketName;
    let testFilePath;

    beforeEach(() => {
      errorBucketName = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      testFilePath = path.join(testFilesDir, `test-${Date.now()}.txt`);
      fs.writeFileSync(testFilePath, "test content");
    });

    test(
      "should return 400 when trying to delete non-empty bucket",
      async () => {
        // Create bucket and upload file
        await axios.post(`${API_BASE_URL}/buckets`, { bucketName: errorBucketName });

        const form = new FormData();
        form.append("file", fs.createReadStream(testFilePath));
        await axios.post(
          `${API_BASE_URL}/buckets/${errorBucketName}/files`,
          form,
          { headers: form.getHeaders() }
        );

        // Try to delete non-empty bucket
        await expect(
          axios.delete(`${API_BASE_URL}/buckets/${errorBucketName}`)
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: {
              error: {
                code: SDKErrors.BUCKET_NONEMPTY,
                message: ErrorMessages[SDKErrors.BUCKET_NONEMPTY]
              }
            }
          }
        });
      },
      TEST_TIMEOUT
    );

    test(
      "should return 409 when trying to upload duplicate file",
      async () => {
        // Create bucket
        await axios.post(`${API_BASE_URL}/buckets`, { bucketName: errorBucketName });

        // First upload
        const form = new FormData();
        form.append("file", fs.createReadStream(testFilePath));
        await axios.post(
          `${API_BASE_URL}/buckets/${errorBucketName}/files`,
          form,
          { headers: form.getHeaders() }
        );

        // Second upload (should fail)
        const formForSecondUpload = new FormData();
        formForSecondUpload.append("file", fs.createReadStream(testFilePath));
        await expect(
          axios.post(
            `${API_BASE_URL}/buckets/${errorBucketName}/files`,
            formForSecondUpload,
            { headers: formForSecondUpload.getHeaders() }
          )
        ).rejects.toMatchObject({
          response: {
            status: 409,
            data: {
              error: {
                code: SDKErrors.FILE_FULLY_UPLOADED,
                message: ErrorMessages[SDKErrors.FILE_FULLY_UPLOADED]
              }
            }
          }
        });
      },
      TEST_TIMEOUT
    );

    afterEach(async () => {
      // Clean up test files
      try {
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      } catch (error) {
        console.warn('Failed to delete test file:', error.message);
      }

      // Clean up bucket and files
      try {
        const filesResponse = await axios.get(`${API_BASE_URL}/buckets/${errorBucketName}/files`);
        if (filesResponse.data.success && filesResponse.data.data) {
          await Promise.all(
            filesResponse.data.data.map(file =>
              axios.delete(`${API_BASE_URL}/buckets/${errorBucketName}/files/${file.Name}`)
                .catch(err => console.warn(`Failed to delete file ${file.Name}:`, err.message))
            )
          );
        }
        await axios.delete(`${API_BASE_URL}/buckets/${errorBucketName}`);
      } catch (error) {
        // Ignore cleanup errors
        console.warn('Bucket cleanup error:', error.message);
      }
    }, CLEANUP_TIMEOUT);
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(testFilesDir)) {
        fs.rmSync(testFilesDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('Failed to cleanup test directory:', error.message);
    }
  }, CLEANUP_TIMEOUT);
});
