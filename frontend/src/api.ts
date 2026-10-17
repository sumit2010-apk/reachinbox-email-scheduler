
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export type EmailStatus =
  | "scheduled"
  | "queued"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled";

export interface Email {
  id: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  scheduledAt: string;
  status: EmailStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface EmailListResponse {
  data: Email[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchEmails(
  page = 1,
  limit = 10,
  status?: EmailStatus,
): Promise<EmailListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (status) {
    params.set("status", status);
  }

  const response = await fetch(
    `${API_URL}/api/emails?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`Unable to load emails (${response.status}).`);
  }

  return response.json() as Promise<EmailListResponse>;
}

export interface ScheduleEmailInput {
  recipientEmail: string;
  subject: string;
  bodyText: string;
  scheduledAt: string;
}

export interface ScheduleEmailResponse {
  message: string;
  created: boolean;
  email: Email;
}

export async function scheduleEmail(
  input: ScheduleEmailInput,
  idempotencyKey?: string,
): Promise<ScheduleEmailResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  headers["Idempotency-Key"] =
    idempotencyKey || crypto.randomUUID();

  const response = await fetch(`${API_URL}/api/emails`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error || `Unable to schedule email (${response.status}).`,
    );
  }

  return result as ScheduleEmailResponse;
}
