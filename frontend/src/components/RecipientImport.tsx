
import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import "./RecipientImport.css";

type ImportResult = {
  emails: string[];
  invalid: string[];
  duplicates: string[];
};

type RecipientImportProps = {
  onRecipientsReady: (emails: string[]) => void;
};

function validateEmails(values: string[]): ImportResult {
  const emails: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const email = value.trim().toLowerCase();
    if (!email) continue;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalid.push(value.trim());
      continue;
    }

    if (seen.has(email)) {
      duplicates.push(email);
      continue;
    }

    seen.add(email);
    emails.push(email);
  }

  return { emails, invalid, duplicates };
}

export default function RecipientImport({
  onRecipientsReady,
}: RecipientImportProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pastedText, setPastedText] = useState("");
  const [parsedValues, setParsedValues] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const result = useMemo(
    () => validateEmails(parsedValues),
    [parsedValues],
  );

  function parsePastedText() {
    setError("");
    setSuccess("");
    setFileName("");

    setParsedValues(
      pastedText
        .split(/[\n,;\t]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  function handleFile(file?: File) {
    if (!file) return;

    setError("");
    setSuccess("");
    setParsedValues([]);
    setFileName("");

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (!["csv", "txt"].includes(extension ?? "")) {
      setError("Please upload a .csv or .txt file.");
      return;
    }

    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (parsed) => {
        const values = parsed.data.flatMap((row) =>
          row.flatMap((cell) => cell.split(/[\n,;\t]+/)),
        );

        // Ignore common CSV header names.
        const cleanedValues = values.filter(
          (value) =>
            !["email", "email address", "recipient", "recipient email"].includes(
              value.trim().toLowerCase(),
            ),
        );

        setParsedValues(cleanedValues);
        setFileName(file.name);

        if (parsed.errors.length > 0) {
          setError(
            `The file was parsed with ${parsed.errors.length} warning(s). Review the preview.`,
          );
        }
      },
      error: () => {
        setError("Unable to read this file. Please try another.");
      },
    });
  }

  function clearImport() {
    setPastedText("");
    setParsedValues([]);
    setFileName("");
    setError("");
    setSuccess("");

    if (fileInput.current) {
      fileInput.current.value = "";
    }
  }

  async function copyValidEmails() {
    setError("");
    setSuccess("");

    try {
      await navigator.clipboard.writeText(result.emails.join("\n"));
      setSuccess("Valid addresses copied to clipboard.");
    } catch {
      setError(
        "Clipboard access failed. You can select and copy the preview manually.",
      );
    }
  }

  function useValidRecipients() {
    if (result.emails.length === 0) {
      setError("Import at least one valid email address first.");
      return;
    }

    onRecipientsReady(result.emails);
    setError("");
    setSuccess(
      `${result.emails.length} valid recipient(s) passed to the dashboard. No emails have been scheduled.`,
    );
  }

  return (
    <section className="recipient-import">
      <div className="recipient-import-heading">
        <div>
          <p className="eyebrow">AUDIENCE</p>
          <h2>Import recipients</h2>
          <p className="import-description">
            Upload a CSV or text file, or paste email addresses to preview your
            list.
          </p>
        </div>
        <span className="import-file-tag">CSV / TXT</span>
      </div>

      <label className="import-upload">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <span className="upload-symbol">↑</span>
        <strong>Choose a recipient file</strong>
        <span>
          CSV or TXT · Email addresses separated by commas or new lines
        </span>
      </label>

      <div className="import-divider">
        <span>OR PASTE ADDRESSES</span>
      </div>

      <label className="import-label" htmlFor="recipient-list">
        Email addresses
      </label>

      <textarea
        id="recipient-list"
        value={pastedText}
        onChange={(event) => setPastedText(event.target.value)}
        placeholder={"alex@example.com\nsam@example.com\njordan@example.com"}
        rows={5}
      />

      <div className="import-actions">
        <button
          type="button"
          className="import-primary"
          onClick={parsePastedText}
        >
          Preview pasted list
        </button>
        <button
          type="button"
          className="import-secondary"
          onClick={clearImport}
        >
          Clear
        </button>
      </div>

      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className="import-success-text" role="status">
          {success}
        </p>
      )}

      {fileName && <p className="import-file-name">Loaded: {fileName}</p>}

      {parsedValues.length > 0 && (
        <div className="import-preview">
          <h3>Import preview</h3>

          <div className="import-stats">
            <div>
              <strong>{result.emails.length}</strong>
              <span>Valid unique</span>
            </div>
            <div>
              <strong>{result.invalid.length}</strong>
              <span>Invalid</span>
            </div>
            <div>
              <strong>{result.duplicates.length}</strong>
              <span>Duplicates</span>
            </div>
          </div>

          <label className="import-label" htmlFor="valid-email-preview">
            Valid recipients
          </label>

          <textarea
            id="valid-email-preview"
            readOnly
            value={result.emails.join("\n")}
            rows={Math.min(6, Math.max(2, result.emails.length))}
          />

          {result.invalid.length > 0 && (
            <details>
              <summary>View invalid entries ({result.invalid.length})</summary>
              <ul>
                {result.invalid.map((email, index) => (
                  <li key={`${email}-${index}`}>{email}</li>
                ))}
              </ul>
            </details>
          )}

          {result.duplicates.length > 0 && (
            <details>
              <summary>View duplicates ({result.duplicates.length})</summary>
              <ul>
                {result.duplicates.map((email, index) => (
                  <li key={`${email}-${index}`}>{email}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="import-actions">
            <button
              type="button"
              className="import-primary"
              onClick={useValidRecipients}
              disabled={result.emails.length === 0}
            >
              Use valid recipients
            </button>

            <button
              type="button"
              className="import-secondary"
              onClick={copyValidEmails}
              disabled={result.emails.length === 0}
            >
              Copy valid addresses
            </button>
          </div>

          <p className="import-note">
            Preview only: recipients are not scheduled or sent automatically.
          </p>
        </div>
      )}
    </section>
  );
}
