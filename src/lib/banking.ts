import { DocumentType, Prisma, TransactionType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildAuditRecord } from "@/lib/audit";
import { uploadBlob } from "@/lib/blob";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { buildReceiptPdf } from "@/lib/receipt";
import { buildReference, buildRequestId } from "@/lib/utils";

function decimalToNumber(value: Prisma.Decimal | number | string) {
  return Number(value);
}

function buildBlobPaths(customerId: string, accountId: string, transactionId: string, kind: "pdf" | "json") {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const base = `customer-${customerId}/account-${accountId}/year=${year}/month=${month}`;

  return kind === "pdf"
    ? `${base}/transaction-${transactionId}.pdf`
    : `${base}/transaction-${transactionId}.json`;
}

export async function registerCustomer(input: {
  fullName: string;
  email: string;
  phone?: string;
  passwordHash: string;
}) {
  const customerNo = `CUST-${Math.floor(100000 + Math.random() * 900000)}`;
  const accountNumber = `${Math.floor(1000000000 + Math.random() * 9000000000)}`;

  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      role: UserRole.CUSTOMER,
      customer: {
        create: {
          fullName: input.fullName,
          phone: input.phone || null,
          customerNo,
          accounts: {
            create: {
              accountNumber,
              accountType: "Premier Checking",
              currency: "USD",
              availableBalance: 0
            }
          }
        }
      }
    },
    include: {
      customer: {
        include: {
          accounts: true
        }
      }
    }
  });
}

export async function getDashboardData(userId: string, role: UserRole) {
  if (role === UserRole.ADMIN) {
    const [customerCount, transactionCount, documentCount, recentTransactions] = await Promise.all([
      prisma.customer.count(),
      prisma.transaction.count(),
      prisma.blobDocument.count(),
      prisma.transaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          customer: true,
          account: true
        }
      })
    ]);

    return { customerCount, transactionCount, documentCount, recentTransactions };
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      customer: {
        include: {
          accounts: true
        }
      }
    }
  });
  const account = user.customer?.accounts[0];
  if (!account || !user.customer) {
    throw new Error("Customer account not found.");
  }

  const [transactions, blobDocs] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.blobDocument.findMany({
      where: { accountId: account.id },
      orderBy: { uploadedAt: "desc" },
      take: 8
    })
  ]);

  return { user, account, transactions, blobDocs };
}

export async function getCustomerAccount(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      customer: {
        include: {
          accounts: true
        }
      }
    }
  });

  const customer = user.customer;
  const account = customer?.accounts[0];
  if (!customer || !account) {
    throw new Error("Customer account unavailable.");
  }

  return { user, customer, account };
}

export async function createTransaction(userId: string, type: TransactionType, amount: number, description?: string) {
  const env = getEnv();
  const { customer, account, user } = await getCustomerAccount(userId);
  const requestId = buildRequestId();
  const reference = buildReference(type === TransactionType.DEPOSIT ? "DEP" : "WDL");

  return prisma.$transaction(async (tx) => {
    const currentAccount = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
    const currentBalance = decimalToNumber(currentAccount.availableBalance);
    const nextBalance =
      type === TransactionType.DEPOSIT ? currentBalance + amount : currentBalance - amount;

    if (type === TransactionType.WITHDRAWAL && nextBalance < 0) {
      throw new Error("Insufficient funds for withdrawal.");
    }

    const transaction = await tx.transaction.create({
      data: {
        accountId: account.id,
        customerId: customer.id,
        type,
        amount,
        balanceBefore: currentBalance,
        balanceAfter: nextBalance,
        description,
        reference
      }
    });

    await tx.account.update({
      where: { id: account.id },
      data: {
        availableBalance: nextBalance
      }
    });

    const receiptBuffer = await buildReceiptPdf({
      accountNumber: account.accountNumber,
      customerName: customer.fullName,
      transactionId: transaction.id,
      reference,
      type,
      amount,
      oldBalance: currentBalance,
      newBalance: nextBalance,
      createdAt: transaction.createdAt
    });

    const receiptPath = buildBlobPaths(customer.id, account.id, transaction.id, "pdf");
    const auditPath = buildBlobPaths(customer.id, account.id, transaction.id, "json");

    const auditPayload = {
      transactionId: transaction.id,
      customerId: customer.id,
      accountId: account.id,
      transactionType: type,
      amount,
      oldBalance: currentBalance,
      newBalance: nextBalance,
      timestamp: transaction.createdAt.toISOString(),
      appServiceInstance: env.APP_SERVICE_INSTANCE,
      requestId,
      blobUploadStatus: "pending",
      metadata: {
        accountNumber: account.accountNumber,
        customerEmail: user.email
      }
    };

    const receiptBlob = await uploadBlob({
      containerName: env.AZURE_STORAGE_CONTAINER_RECEIPTS,
      blobPath: receiptPath,
      body: receiptBuffer,
      contentType: "application/pdf",
      metadata: {
        transactionid: transaction.id,
        accountid: account.id,
        customerid: customer.id,
        doctype: "receipt-pdf"
      }
    });

    const auditBlob = await uploadBlob({
      containerName: env.AZURE_STORAGE_CONTAINER_AUDITS,
      blobPath: auditPath,
      body: buildAuditRecord({
        ...auditPayload,
        blobUploadStatus: "uploaded"
      }),
      contentType: "application/json",
      metadata: {
        transactionid: transaction.id,
        accountid: account.id,
        customerid: customer.id,
        doctype: "audit-json"
      }
    });

    await tx.blobDocument.createMany({
      data: [
        {
          customerId: customer.id,
          accountId: account.id,
          transactionId: transaction.id,
          documentType: DocumentType.RECEIPT_PDF,
          containerName: receiptBlob.containerName,
          blobPath: receiptBlob.blobPath,
          blobUrl: receiptBlob.blobUrl,
          versionId: receiptBlob.versionId ?? null,
          checksum: receiptBlob.checksum,
          metadata: {
            reference,
            requestId,
            description: description ?? null
          }
        },
        {
          customerId: customer.id,
          accountId: account.id,
          transactionId: transaction.id,
          documentType: DocumentType.AUDIT_JSON,
          containerName: auditBlob.containerName,
          blobPath: auditBlob.blobPath,
          blobUrl: auditBlob.blobUrl,
          versionId: auditBlob.versionId ?? null,
          checksum: auditBlob.checksum,
          metadata: {
            reference,
            requestId
          }
        }
      ]
    });

    await tx.auditRecord.create({
      data: {
        customerId: customer.id,
        accountId: account.id,
        transactionId: transaction.id,
        containerName: auditBlob.containerName,
        blobPath: auditBlob.blobPath,
        blobUrl: auditBlob.blobUrl,
        versionId: auditBlob.versionId ?? null,
        eventType: `${type.toLowerCase()}-completed`,
        payload: auditPayload
      }
    });

    log("INFO", "Transaction created with evidence", {
      transactionId: transaction.id,
      reference,
      requestId,
      type,
      amount
    });

    return transaction;
  });
}
