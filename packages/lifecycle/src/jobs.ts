import type { JobRegistry } from "@buildflow/jobs/types";
import { getStorage } from "@buildflow/storage/factory";
import { ORGANIZATION_DELETE_JOB, executeOrganizationDeletion } from "./deletion";
import { ORGANIZATION_EXPORT_JOB, runOrganizationExport } from "./export";
import { RETENTION_SWEEP_JOB, runRetentionSweep } from "./retention";

export const lifecycleJobRegistry: JobRegistry = {
  [ORGANIZATION_EXPORT_JOB]: async (db, payload, meta) => {
    await runOrganizationExport(db, getStorage(), meta.organizationId, String(payload.exportId));
  },
  [RETENTION_SWEEP_JOB]: async (db, _payload, meta) => {
    await runRetentionSweep(db, getStorage(), meta.organizationId);
  },
  [ORGANIZATION_DELETE_JOB]: async (db, _payload, meta) => {
    await executeOrganizationDeletion(db, getStorage(), meta.organizationId);
  },
};
