# Akave Link API

A containerized API service for interacting with Akave's decentralized storage network.

## Quick Start

### 1. Pull the Akavelink docker image
```bash 
docker pull akave/akavelink:latest
```

### 2. Get Node Address
Contact Akave team to receive your dedicated node address.

### 3. Run the container to serve a personal api
```bash
docker run -d \
-p 8000:3000 \
-e NODE_ADDRESS="your_node_address" \
-e PRIVATE_KEY="your_private_key" \
akave/akavelink:latest
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| NODE_ADDRESS | Akave node address | Yes | "" |
| PRIVATE_KEY | Your Akave private key | Yes | "" |
| PORT | API server port | No | 3000 |

NODE_ADDRESS: connect.akave.ai:5500


### 4. Deployment

Expose the spawned api to the web **(Note: This will make your data public and accesible through web make sure you know what you're doing)**

#### Using Ngrok

Install [Ngrok](https://download.ngrok.com/)

Run the following command to expose the api to the web
```bash
ngrok http 8000
```

#### Using Cloudflare Tunnel

Install [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/)

Run the following command to expose the api to the web
```bash
cloudflared tunnel --url http://localhost:8000
```

#### Deploy to a Virtual Private Server (AWS, GCP, etc.)

**Step 1:** Install Docker on your VPS

**Step 2:** Pull the Akavelink docker image
```bash
docker pull akave/akavelink:latest
```

**Step 3:** Run the following command to expose the api to the web
```bash
docker run -d \
-p 8000:3000 \
-e NODE_ADDRESS="your_node_address" \
-e PRIVATE_KEY="your_private_key" \
akave/akavelink:latest
```

**Step 4:** Expose the port 8000 to the web

**Step 5:** Access the api using the public url `http://your_public_ip:8000`


# API Documentation

## Bucket Operations

### Create Bucket
`POST /buckets`

Create a new bucket for file storage.

**Request Body:**
```json
{
    "bucketName": "string"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "Name": "string",
        "Created": "timestamp"
    }
}
```

### List Buckets
`GET /buckets`

Retrieve a list of all buckets.

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "Name": "string",
            "Created": "timestamp"
        }
    ]
}
```

### View Bucket
`GET /buckets/:bucketName`

Get details of a specific bucket.

**Response:**
```json
{
    "success": true,
    "data": {
        "Name": "string",
        "Created": "timestamp"
    }
}
```

## File Operations

### List Files
`GET /buckets/:bucketName/files`

List all files in a specific bucket.

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "Name": "string",
            "Size": "number",
            "Created": "timestamp"
        }
    ]
}
```

### Get File Info
`GET /buckets/:bucketName/files/:fileName`

Get metadata about a specific file.

**Response:**
```json
{
    "success": true,
    "data": {
        "Name": "string",
        "Size": "number",
        "Created": "timestamp"
    }
}
```

### Upload File
`POST /buckets/:bucketName/files`

Upload a file to a specific bucket.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `file` or `file1`: File to upload
  OR
  - `filePath`: Path to file on server

**Response:**
```json
{
    "success": true,
    "data": {
        "Name": "string",
        "Size": "number",
        "Hash": "string"
    }
}
```

### Download File
`GET /buckets/:bucketName/files/:fileName/download`

Download a file from a specific bucket.

**Usage:**
Access this URL directly in your browser to download the file. The file will be automatically downloaded with its original filename.

**Response:**
- Success: File download will begin automatically
- Error:
```json
{
    "success": false,
    "error": "error message"
}
```

## Error Handling

### Error Response Format
All API errors follow a consistent format:
```json
{
    "success": false,
    "error": {
        "code": "ERROR_CODE",
        "message": "Human readable error message",
        "details": {} // Optional additional information
    }
}
```

### SDK Error Codes
| Error Code | HTTP Status | Description | Common Scenarios |
|------------|-------------|-------------|------------------|
| 0x497ef2c2 | 409 | Bucket already exists | Creating a bucket with an existing name |
| 0x4f4b202a | 400 | Invalid bucket name | Invalid characters in bucket name |
| 0x938a92b7 | 404 | Bucket does not exist | Accessing a non-existent bucket |
| 0x89fddc00 | 400 | Bucket is not empty | Deleting a bucket containing files |
| 0xdc64d0ad | 403 | Invalid bucket owner | Accessing bucket without permissions |
| 0x6891dde0 | 409 | File already exists | Creating duplicate file |
| 0x77a3cbd8 | 400 | Invalid file name | Invalid characters in file name |
| 0x21584586 | 404 | File does not exist | Accessing non-existent file |
| 0xd96b03b1 | 409 | File is already fully uploaded | Re-uploading existing file |
| 0xd09ec7af | 409 | Duplicate file name | File name conflict |
| 0x702cf740 | 409 | Duplicate file chunk | Uploading same chunk twice |
| 0xcefa6b05 | 404 | No policy found | Missing access policy |

### Validation Errors
| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid input parameters |
| SYSTEM_ERROR | 500 | Internal system error |
| UNKNOWN_ERROR | 500 | Unexpected error |

### Common Error Scenarios

1. **Creating Duplicate Bucket**
```json
{
    "success": false,
    "error": {
        "code": "0x497ef2c2",
        "message": "Bucket already exists"
    }
}
```

2. **Deleting Non-empty Bucket**
```json
{
    "success": false,
    "error": {
        "code": "0x89fddc00",
        "message": "Bucket is not empty"
    }
}
```

3. **Uploading Duplicate File**
```json
{
    "success": false,
    "error": {
        "code": "0xd96b03b1",
        "message": "File is already fully uploaded"
    }
}
```

4. **Invalid Input**
```json
{
    "success": false,
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "Invalid input parameters",
        "details": {
            "field": "", // field name
            "type": "required"
        }
    }
}
```

