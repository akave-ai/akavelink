export interface BucketInfo {
    Name: string;
    Owner?: string;
    CreationDate?: string;
    Visibility?: string;
  }
  
  export interface FileInfo {
    Name: string;
    Size?: string;
    Hash?: string;
    ContentType?: string;
    LastModified?: string;
  }
  
  export interface CommandResult<T> {
    data: T;
    transactionHash?: string;
  }
  
  export interface AkaveIPCClientConfig {
    nodeAddress: string;
    privateKey: string;
  }
  
  export type ParserType = 
    | "default"
    | "createBucket"
    | "listBuckets"
    | "viewBucket"
    | "deleteBucket"
    | "listFiles"
    | "fileInfo"
    | "uploadFile"
    | "downloadFile";