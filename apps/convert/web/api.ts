export type JobListItem = {
  id: string;
  source_type: string;
  source_name: string;
  status: string;
  phase: string;
  progress_message: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  zip_path: string | null;
};

export type Settings = {
  mineruTokenConfigured: boolean;
  mineruTokenHint: string | null;
  retentionDays: number;
  proxyEnabled: boolean;
  proxyUrl: string;
  assetBudgetBytes: number;
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) msg = body.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  settings(): Promise<Settings> {
    return fetch("/api/settings").then((r) => json(r));
  },
  saveSettings(body: Partial<{
    mineruToken: string | null;
    retentionDays: number;
    proxyEnabled: boolean;
    proxyUrl: string;
  }>): Promise<Settings> {
    return fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json(r));
  },
  listJobs(): Promise<{ jobs: JobListItem[] }> {
    return fetch("/api/jobs").then((r) => json(r));
  },
  getJob(id: string): Promise<Record<string, unknown>> {
    return fetch(`/api/jobs/${id}`).then((r) => json(r));
  },
  createJob(form: FormData): Promise<{ id: string }> {
    return fetch("/api/jobs", { method: "POST", body: form }).then((r) => json(r));
  },
  cancelJob(id: string): Promise<{ ok: boolean }> {
    return fetch(`/api/jobs/${id}/cancel`, { method: "POST" }).then((r) => json(r));
  },
  retryFailed(id: string): Promise<{ ok: boolean }> {
    return fetch(`/api/jobs/${id}/retry-failed-segments`, { method: "POST" }).then((r) =>
      json(r),
    );
  },
  deleteJob(id: string): Promise<{ ok: boolean }> {
    return fetch(`/api/jobs/${id}`, { method: "DELETE" }).then((r) => json(r));
  },
  downloadUrl(id: string, del = false): string {
    return `/api/jobs/${id}/download${del ? "?delete=1" : ""}`;
  },
};
