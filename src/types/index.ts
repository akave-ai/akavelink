// Core Data Structures
export interface Bucket {
  Name: string
  Created: string
}

export interface File {
  Name: string
  Size: number
  Created: string
  Hash?: string
}

export interface UploadResult {
  Name: string
  Size: number
  Hash: string
  transactionHash?: string
}

// API Request Types
export interface CreateBucketRequest {
  bucketName: string
}

export interface UploadFileRequest {
  file?: Express.Multer.File
  filePath?: string
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// Logger Types
export interface Logger {
  info: (id: string, message: string, data?: object) => void
  error: (id: string, message: string, error?: object) => void
  warn: (id: string, message: string, data?: object) => void
}

// Client Configuration
export interface ClientConfig {
  nodeAddress: string
  privateKey: string
}

// Error Types
export class AkaveError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
    this.name = "AkaveError"
  }
}
