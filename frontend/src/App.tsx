
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  fetchEmails,
  scheduleEmail,
  type Email,
  type EmailStatus,
} from "./api";
import RecipientImport from "./components/RecipientImport";
import "./App.css";

const filters = [
  { label: "All emails", value: "all" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Sent", value: "sent" },
  { label: "Failed", value: "failed" },
] as const;

type BatchResults = {
  successes: string[];
  failures: { email: string; error: string }[];
};

function App() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [totalEmails, setTotalEmails] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [importedRecipients, setImportedRecipients] = useState<string[]>([]);
  const [useImportedRecipients, setUseImportedRecipients] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResults | null>(null);

  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [formError, setFormError] = useState("");

  const loadEmails = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await fetchEmails(1, 100);
      setEmails(result.data);
      setTotalEmails(result.pagination.total);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load emails.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmails();
  }, [loadEmails, refreshKey]);

  const visibleEmails = emails.filter((email) => {
    const matchesFilter =
      activeFilter === "all" || email.status === activeFilter;

    const matchesSearch =
      `${email.recipientEmail} ${email.subject}`
        .toLowerCase()
        .includes(search.trim().toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const countByStatus = (status: EmailStatus) =>
    emails.filter((email) => email.status === status).length;

  const scheduledCount =
    countByStatus("scheduled") + countByStatus("queued");

  function handleRefresh() {
    setSearch("");
    setActiveFilter("all");
    setRefreshKey((key) => key + 1);
  }

  function openCompose() {
    document
      .getElementById("compose-email")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openImport() {
    document
      .getElementById("import-recipients")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleRecipientsReady(emails: string[]) {
    const uniqueEmails = [
      ...new Set(emails.map((email) => email.trim().toLowerCase())),
    ].filter(Boolean);

    setImportedRecipients(uniqueEmails);
    setUseImportedRecipients(true);
    setBatchResults(null);
    setFormMessage("");
    setFormError("");

    if (uniqueEmails.length > 0) {
      setRecipientEmail("");
      openCompose();
    }
  }

  async function handleSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage("");
    setFormError("");
    setBatchResults(null);

    const date = new Date(scheduledAt);

    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      setFormError("Choose a date and time in the future.");
      return;
    }

    const recipients = useImportedRecipients
      ? [
          ...new Set(
            importedRecipients.map((email) => email.trim().toLowerCase()),
          ),
        ]
      : [recipientEmail.trim().toLowerCase()];

    if (recipients.length === 0 || !recipients[0]) {
      setFormError(
        useImportedRecipients
          ? "Import valid recipients before choosing bulk scheduling."
          : "Enter a recipient email address.",
      );
      return;
    }

    if (!subject.trim() || !bodyText.trim()) {
      setFormError("Subject and message are required.");
      return;
    }

    if (
      recipients.some(
        (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      )
    ) {
      setFormError("One or more recipient addresses are invalid.");
      return;
    }

    setSubmitting(true);

    const successes: string[] = [];
    const failures: { email: string; error: string }[] = [];

    try {
      // Sequential requests avoid flooding the API with simultaneous writes.
      for (const email of recipients) {
        // A stable key makes a repeat request for the same recipient and
        // scheduled time idempotent, including after a network retry.
        const idempotencyKey =
          `reachinbox-${email}-${date.getTime()}`;

        try {
          await scheduleEmail(
            {
              recipientEmail: email,
              subject: subject.trim(),
              bodyText: bodyText.trim(),
              scheduledAt: date.toISOString(),
            },
            idempotencyKey,
          );

          successes.push(email);
        } catch (err: unknown) {
          failures.push({
            email,
            error:
              err instanceof Error
                ? err.message
                : "Unknown scheduling error.",
          });
        }
      }

      setBatchResults({ successes, failures });

      if (successes.length > 0) {
        setRefreshKey((key) => key + 1);
        setActiveFilter("all");
        setSearch("");
      }

      if (failures.length === 0) {
        setFormMessage(
          `All ${successes.length} recipient(s) were processed successfully.`,
        );

        setRecipientEmail("");
        setSubject("");
        setBodyText("");
        setScheduledAt("");
        setImportedRecipients([]);
        setUseImportedRecipients(false);
      } else {
        setFormMessage(
          `${successes.length} of ${recipients.length} recipient(s) were processed successfully.`,
        );
        setFormError(
          `${failures.length} recipient(s) could not be scheduled. See the results below.`,
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  const localNow = new Date();
  localNow.setMinutes(
    localNow.getMinutes() - localNow.getTimezoneOffset(),
  );
  const minDateTime = localNow.toISOString().slice(0, 16);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="ReachInbox home">
          <span className="brand-mark">r</span>
          <span>
            reachinbox<span className="brand-dot">.</span>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>

        <button className="workspace-switch" type="button">
          <span className="workspace-avatar">S</span>
          <span className="workspace-name">Sumit's workspace</span>
          <span>⌄</span>
        </button>

        <nav className="navigation" aria-label="Main navigation">
          <a className="nav-item active" href="#">
            <span>▦</span> Overview
          </a>

          <a
            className="nav-item"
            href="#emails"
            onClick={() => setActiveFilter("all")}
          >
            <span>✉</span> All emails
          </a>

          <a
            className="nav-item"
            href="#emails"
            onClick={() => setActiveFilter("scheduled")}
          >
            <span>◷</span> Scheduled
          </a>

          <a
            className="nav-item"
            href="#emails"
            onClick={() => setActiveFilter("sent")}
          >
            <span>✓</span> Sent
          </a>

          <a
            className="nav-item"
            href="#emails"
            onClick={() => setActiveFilter("failed")}
          >
            <span>⚠</span> Failed
          </a>

          <a
            className="nav-item"
            href="#import-recipients"
            onClick={openImport}
          >
            <span>⇧</span> Import recipients
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-icon">✦</div>
            <strong>Keep things moving</strong>
            <p>Your outreach, organized in one place.</p>
            <div className="plan-line">
              <span />
            </div>
            <small>Workspace dashboard</small>
          </div>

          <div className="profile">
            <div className="profile-avatar">SS</div>
            <div className="profile-info">
              <strong>Sumit Singh</strong>
              <span>Workspace admin</span>
            </div>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> Overview
          </div>

          <div className="topbar-actions">
            <span className="connection">
              <span /> API dashboard
            </span>

            <button
              className="icon-button"
              type="button"
              aria-label="Notifications"
            >
              ♧
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR OUTREACH, AT A GLANCE</div>
              <h1>Good to see you again.</h1>
              <p className="page-subtitle">
                Here's what's happening with your emails today.
              </p>
            </div>

            <button
              className="primary-button"
              type="button"
              onClick={openCompose}
            >
              <span>＋</span> Schedule an email
            </button>
          </div>

          <div className="stats-grid">
            <StatCard
              label="Total emails"
              value={String(totalEmails)}
              detail="Across your workspace"
              icon="✉"
              tone="purple"
            />

            <StatCard
              label="Scheduled"
              value={String(scheduledCount)}
              detail="Waiting to be sent"
              icon="◷"
              tone="blue"
            />

            <StatCard
              label="Successfully sent"
              value={String(countByStatus("sent"))}
              detail="Confirmed deliveries"
              icon="✓"
              tone="green"
            />

            <StatCard
              label="Failed"
              value={String(countByStatus("failed"))}
              detail="Need your attention"
              icon="!"
              tone="orange"
            />
          </div>

          <section className="email-panel" id="emails">
            <div className="panel-heading">
              <div>
                <h2>Email activity</h2>
                <p>Review and manage your scheduled outreach.</p>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={handleRefresh}
                disabled={loading}
              >
                ↻ {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="table-toolbar">
              <div className="filter-tabs">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={`filter-tab ${
                      activeFilter === filter.value ? "selected" : ""
                    }`}
                    onClick={() => setActiveFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <label className="search-box">
                <span>⌕</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search emails..."
                  aria-label="Search by recipient or subject"
                />
              </label>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>RECIPIENT / SUBJECT</th>
                    <th>SCHEDULED TIME</th>
                    <th>STATUS</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={4} className="empty-state">
                        Loading emails...
                      </td>
                    </tr>
                  )}

                  {!loading && error && (
                    <tr>
                      <td colSpan={4} className="empty-state">
                        <p>{error}</p>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setRefreshKey((key) => key + 1)}
                        >
                          Try again
                        </button>
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    !error &&
                    visibleEmails.map((email) => (
                      <tr key={email.id}>
                        <td>
                          <div className="recipient">
                            {email.recipientEmail}
                          </div>
                          <div className="subject">{email.subject}</div>
                        </td>

                        <td className="date-cell">
                          {new Date(email.scheduledAt).toLocaleString(
                            undefined,
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            },
                          )}
                        </td>

                        <td>
                          <StatusBadge status={email.status} />
                        </td>

                        <td>
                          <button
                            className="row-menu"
                            type="button"
                            aria-label={`Actions for ${email.subject}`}
                            title={`Email ID: ${email.id}`}
                          >
                            ···
                          </button>
                        </td>
                      </tr>
                    ))}

                  {!loading && !error && visibleEmails.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty-state">
                        No emails match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>
                Showing {visibleEmails.length} of {totalEmails} emails
              </span>
              <span className="page-number">Live database</span>
            </div>
          </section>

          <section id="import-recipients" className="compose-panel">
            <RecipientImport onRecipientsReady={handleRecipientsReady} />

            {importedRecipients.length > 0 && (
              <p className="import-success-text" role="status">
                {importedRecipients.length} valid recipient(s) ready.
              </p>
            )}
          </section>

          <section className="compose-panel" id="compose-email">
            <div className="compose-header">
              <div className="eyebrow">EMAIL COMPOSER</div>
              <h2>Schedule an email</h2>
              <p>
                Write your message and choose when it should be sent.
              </p>
            </div>

            <form className="compose-form" onSubmit={handleSchedule}>
              <div className="form-field">
                <span>Recipients</span>

                {importedRecipients.length > 0 && (
                  <label>
                    <input
                      type="checkbox"
                      checked={useImportedRecipients}
                      onChange={(event) => {
                        setUseImportedRecipients(event.target.checked);
                        setFormMessage("");
                        setFormError("");
                        setBatchResults(null);
                      }}
                    />
                    Schedule for imported recipients (
                    {importedRecipients.length})
                  </label>
                )}

                {!useImportedRecipients && (
                  <input
                    type="email"
                    required
                    maxLength={254}
                    placeholder="name@example.com"
                    value={recipientEmail}
                    onChange={(event) => setRecipientEmail(event.target.value)}
                  />
                )}

                {useImportedRecipients && (
                  <p className="form-note">
                    One email will be scheduled per imported recipient.
                  </p>
                )}
              </div>

              <label className="form-field">
                <span>Subject</span>
                <input
                  type="text"
                  required
                  maxLength={998}
                  placeholder="What is this email about?"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Message</span>
                <textarea
                  required
                  rows={5}
                  placeholder="Write your email message..."
                  value={bodyText}
                  onChange={(event) => setBodyText(event.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Schedule date and time (your local time)</span>
                <input
                  type="datetime-local"
                  required
                  min={minDateTime}
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              </label>

              {formMessage && (
                <p className="form-success" role="status">
                  {formMessage}
                </p>
              )}

              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}

              {batchResults && (
                <div className="import-preview" aria-live="polite">
                  <h3>Scheduling results</h3>
                  <p>Successful: {batchResults.successes.length}</p>
                  <p>Failed: {batchResults.failures.length}</p>

                  {batchResults.successes.length > 0 && (
                    <details>
                      <summary>
                        View successful recipients (
                        {batchResults.successes.length})
                      </summary>
                      <ul>
                        {batchResults.successes.map((email) => (
                          <li key={email}>{email}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {batchResults.failures.length > 0 && (
                    <details open>
                      <summary>
                        View failed recipients ({batchResults.failures.length})
                      </summary>
                      <ul>
                        {batchResults.failures.map(({ email, error }) => (
                          <li key={email}>
                            <strong>{email}</strong>: {error}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              <div className="compose-actions">
                <span className="form-note">
                  {useImportedRecipients
                    ? `${importedRecipients.length} recipient(s) selected. Requests are processed sequentially.`
                    : "The email will be queued for its scheduled time."}
                </span>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting
                    ? "Scheduling..."
                    : useImportedRecipients
                      ? `Schedule for ${importedRecipients.length} recipients`
                      : "Schedule email"}
                </button>
              </div>
            </form>
          </section>

          <footer className="footer">
            <span>ReachInbox Scheduler</span>
            <span>
              Built for thoughtful outreach{" "}
              <span className="heart">♥</span>
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
  tone: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </article>
  );
}

function StatusBadge({ status }: { status: EmailStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`status-badge ${status}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

export default App;
