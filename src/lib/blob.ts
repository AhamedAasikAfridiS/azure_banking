import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { getEnv, getRequiredEnv } from "@/lib/env";
import { sha256 } from "@/lib/utils";

type UploadBlobInput = {
  containerName: string;
  blobPath: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
};

const credential = new DefaultAzureCredential();

function getBlobServiceClient() {
  const env = getEnv();
  const useManagedIdentity = env.AZURE_STORAGE_USE_MANAGED_IDENTITY === "true";
  if (useManagedIdentity) {
    return new BlobServiceClient(getRequiredEnv("AZURE_STORAGE_ACCOUNT_URL"), credential);
  }

  if (!env.AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is required when managed identity is disabled.");
  }

  return BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
}

export async function ensureContainer(containerName: string) {
  const client = getBlobServiceClient().getContainerClient(containerName);
  await client.createIfNotExists();
  return client;
}

export async function uploadBlob(input: UploadBlobInput) {
  const container = await ensureContainer(input.containerName);
  const blobClient = container.getBlockBlobClient(input.blobPath);
  const result = await blobClient.uploadData(input.body, {
    blobHTTPHeaders: {
      blobContentType: input.contentType
    },
    metadata: input.metadata
  });

  return {
    containerName: input.containerName,
    blobPath: input.blobPath,
    blobUrl: blobClient.url,
    versionId: result.versionId,
    checksum: sha256(input.body)
  };
}

export async function generateReadUrl(containerName: string, blobPath: string) {
  const env = getEnv();
  const service = getBlobServiceClient();
  const blobClient = service.getContainerClient(containerName).getBlobClient(blobPath);
  const useManagedIdentity = env.AZURE_STORAGE_USE_MANAGED_IDENTITY === "true";

  if (useManagedIdentity) {
    const key = await service.getUserDelegationKey(new Date(), new Date(Date.now() + 15 * 60 * 1000));
    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse("r"),
        startsOn: new Date(),
        expiresOn: new Date(Date.now() + 10 * 60 * 1000)
      },
      key,
      getRequiredEnv("AZURE_STORAGE_ACCOUNT_NAME")
    );
    return `${blobClient.url}?${sas.toString()}`;
  }

  const connectionString = env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("Unable to generate read URL without managed identity or connection string.");
  }

  const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);
  if (!accountKeyMatch) {
    throw new Error("AccountKey missing from connection string.");
  }

  const sharedKey = new StorageSharedKeyCredential(getRequiredEnv("AZURE_STORAGE_ACCOUNT_NAME"), accountKeyMatch[1]);
  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(),
      expiresOn: new Date(Date.now() + 10 * 60 * 1000)
    },
    sharedKey
  );

  return `${blobClient.url}?${sas.toString()}`;
}
