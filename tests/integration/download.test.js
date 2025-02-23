const axios = require("axios");
const fs = require("fs");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const FormData = require("form-data");

const API_BASE_URL = process.env.API_URL || "http://localhost:8000";
const TEST_TIMEOUT = 300000;

describe("File Download Operations", () => {
  let bucketName;
  let tempFileName;
  let tempFilePath;
  let fileContent;

  beforeAll(async () => {
    // Setup test directory
    if (!fs.existsSync("./test-files")) {
      fs.mkdirSync("./test-files");
    }

    // Create test bucket
    bucketName = `test-${Math.random().toString(36).substring(7)}`;
    await axios.post(`${API_BASE_URL}/buckets`, { bucketName });

    // Create and upload test file
    tempFileName = `test_${Date.now()}_${uuidv4().replace(/-/g, "_")}.bin`;
    tempFilePath = path.join("./test-files", tempFileName);

    // Create 1MB test file with random data
    fileContent = crypto.randomBytes(1024 * 1024);
    fs.writeFileSync(tempFilePath, fileContent);

    // Upload file
    const form = new FormData();
    form.append("file", fs.createReadStream(tempFilePath));
    await axios.post(`${API_BASE_URL}/buckets/${bucketName}/files`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }, TEST_TIMEOUT);

  test(
    "should support full file download (backward compatibility)",
    async () => {
      const response = await axios.get(
        `${API_BASE_URL}/buckets/${bucketName}/files/${tempFileName}/download`,
        { responseType: "arraybuffer" }
      );

      expect(response.status).toBe(200);
      expect(response.headers["accept-ranges"]).toBe("bytes");
      expect(response.headers["content-length"]).toBe(
        fileContent.length.toString()
      );

      const downloadedContent = Buffer.from(response.data);
      expect(downloadedContent).toEqual(fileContent);
    },
    TEST_TIMEOUT
  );

  test(
    "should support partial file download",
    async () => {
      const start = 100;
      const end = 199;
      const response = await axios.get(
        `${API_BASE_URL}/buckets/${bucketName}/files/${tempFileName}/download`,
        {
          headers: { Range: `bytes=${start}-${end}` },
          responseType: "arraybuffer",
        }
      );

      expect(response.status).toBe(206);
      expect(response.headers["accept-ranges"]).toBe("bytes");
      expect(response.headers["content-length"]).toBe("100");
      expect(response.headers["content-range"]).toBe(
        `bytes ${start}-${end}/${fileContent.length}`
      );

      const downloadedContent = Buffer.from(response.data);
      expect(downloadedContent).toEqual(fileContent.slice(start, end + 1));
    },
    TEST_TIMEOUT
  );

  test(
    "should handle invalid range request gracefully",
    async () => {
      expect.assertions(2);

      try {
        await axios.get(
          `${API_BASE_URL}/buckets/${bucketName}/files/${tempFileName}/download`,
          {
            headers: { Range: "bytes=1000000-2000000" },
          }
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.response.status).toBe(416);
        expect(error.response.data).toEqual({
          success: false,
          error: "Requested range not satisfiable",
        });
      }
    },
    TEST_TIMEOUT
  );

  test(
    "should handle malformed range header gracefully",
    async () => {
      const response = await axios.get(
        `${API_BASE_URL}/buckets/${bucketName}/files/${tempFileName}/download`,
        {
          headers: { Range: "invalid-range" },
          responseType: "arraybuffer",
        }
      );

      // Should fall back to full file download
      expect(response.status).toBe(200);
      const downloadedContent = Buffer.from(response.data);
      expect(downloadedContent).toEqual(fileContent);
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
