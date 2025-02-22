const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const FormData = require("form-data");
const path = require("path");

const API_BASE_URL = process.env.API_URL || "http://localhost:8000";
const TEST_TIMEOUT = 30000; // 30 seconds

describe("Bucket Operations", () => {
  let bucketName;
  let tempFileName;
  let tempFilePath;

  beforeAll(() => {
    // Create test directory if it doesn't exist
    console.log("Creating test directory");
    if (!fs.existsSync("./test-files")) {
      fs.mkdirSync("./test-files");
    }
    bucketName = `test-${Math.random().toString(36).substring(7)}`;
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
      tempFilePath = path.join("./test-files", tempFileName);

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

  afterAll(async () => {
    // Cleanup
    if (fs.existsSync("./test-files")) {
      fs.rmSync("./test-files", { recursive: true, force: true });
    }
  });
});
