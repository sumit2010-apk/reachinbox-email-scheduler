
import { fetchEmails } from "./api";

fetchEmails()
  .then((result) => {
    console.log("API connection successful");
    console.log("Total emails:", result.pagination.total);
    console.table(
      result.data.map((email) => ({
        recipient: email.recipientEmail,
        subject: email.subject,
        status: email.status,
      })),
    );
  })
  .catch((error: unknown) => {
    console.error("API connection failed:", error);
  });
