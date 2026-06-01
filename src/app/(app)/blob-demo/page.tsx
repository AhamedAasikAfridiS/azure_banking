import { Card, PageTitle } from "@/components/ui";
import { getEnv } from "@/lib/env";

export default function BlobDemoPage() {
  const env = getEnv();
  const containers = [
    env.AZURE_STORAGE_CONTAINER_KYC,
    env.AZURE_STORAGE_CONTAINER_RECEIPTS,
    env.AZURE_STORAGE_CONTAINER_AUDITS,
    env.AZURE_STORAGE_CONTAINER_STATEMENTS,
    env.AZURE_STORAGE_CONTAINER_EXPORTS
  ];

  return (
    <div>
      <PageTitle
        title="Blob Storage Demo"
        subtitle="This page explains how the application uses private Azure Blob Storage containers, lifecycle management, soft delete, versioning, and geo-redundancy."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-xl font-semibold">Containers</h2>
          <ul className="space-y-3 text-sm text-slate">
            {containers.map((container) => (
              <li key={container} className="rounded-2xl border border-ink/8 px-4 py-3">
                {container}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-4 text-xl font-semibold">Geo-Replication Demo Notes</h2>
          <div className="space-y-3 text-sm text-slate">
            <p>Writes occur against the primary endpoint through App Service and Managed Identity.</p>
            <p>Read-access geo-redundant storage enables controlled read testing from the secondary endpoint.</p>
            <p>Receipts and audit files are ideal demo artifacts for explaining asynchronous replication, RPO, and failover caveats.</p>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-xl font-semibold">Lifecycle Policy Pattern</h2>
          <div className="space-y-3 text-sm text-slate">
            <p>Move older receipt PDFs to Cool after 30 days.</p>
            <p>Move audit JSON to Archive after 90 days when compliance allows.</p>
            <p>Delete temporary exports after 7 days to reduce storage cost and retention risk.</p>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-xl font-semibold">Versioning & Soft Delete</h2>
          <div className="space-y-3 text-sm text-slate">
            <p>Upload a replacement receipt to create a new blob version while preserving prior history.</p>
            <p>Delete a blob from the portal, then restore it from soft delete to demonstrate recovery.</p>
            <p>Version IDs are stored in PostgreSQL so the evidence trail remains queryable.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
