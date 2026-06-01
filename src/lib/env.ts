import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(16).optional(),
  APP_URL: z.string().url().optional(),
  APP_SERVICE_INSTANCE: z.string().default("local-dev"),
  APP_ENVIRONMENT: z.string().default("development"),
  AZURE_STORAGE_ACCOUNT_NAME: z.string().min(1).optional(),
  AZURE_STORAGE_ACCOUNT_URL: z.string().url().optional(),
  AZURE_STORAGE_USE_MANAGED_IDENTITY: z.string().default("true"),
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER_KYC: z.string().default("kyc-documents"),
  AZURE_STORAGE_CONTAINER_RECEIPTS: z.string().default("transaction-receipts"),
  AZURE_STORAGE_CONTAINER_AUDITS: z.string().default("audit-records"),
  AZURE_STORAGE_CONTAINER_STATEMENTS: z.string().default("bank-statements"),
  AZURE_STORAGE_CONTAINER_EXPORTS: z.string().default("exports"),
  AZURE_KEY_VAULT_URL: z.string().optional(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional()
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }

  return cachedEnv;
}

export function getRequiredEnv<Key extends keyof Env>(key: Key): NonNullable<Env[Key]> {
  const value = getEnv()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }

  return value as NonNullable<Env[Key]>;
}
