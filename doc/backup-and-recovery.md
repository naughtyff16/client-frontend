# Backup and recovery targets — Delbros portals

Status: **targets settled from the client's answer, the BRD and Delbros's own answers.** The only step left is the restore exercise, which can run once the production environment exists.

## Sources

| Source | What it says |
|---|---|
| Client Portal Document 3, point 7 (business owners, 25-Nov-2026) | "RPO - 7days + 12x Monthly + 2x semi-annual"; "RTO - 1hr" |
| BRD V1.1, NFR-007 (Business Continuity) | "Daily automated backups with full system restoration achievable within 24 hours." Verified by a recovery test. |
| BRD V1.1, Q-006 (open question) | "Target deployment model (cloud, private cloud, or on-premises) and associated RPO/RTO", to be confirmed at technical design sign-off |
| Delbros Operational Gap Analysis answers (cross-functional) | "The new system must automatically back up all data daily to cloud storage and fully restore operations within 24 hours in case of system failure." |

## Agreed targets

| Item | Target | How it was reached |
|---|---|---|
| Deployment and backup location | Cloud: backups go to cloud storage (the release is packaged for AWS with `npm run package:aws`) | Delbros answer: "back up all data daily to cloud storage" |
| Backup frequency | Daily, automated | BRD NFR-007 and the Delbros answer |
| Recovery point objective (RPO) | Up to 24 hours of data loss (the last daily backup) | Follows from daily backups |
| Retention | 7 daily backups, 12 monthly backups and 2 semi-annual backups | The client's "7days + 12x Monthly + 2x semi-annual", read as a retention schedule on top of the daily backups |
| Recovery time objective (RTO) | 1 hour | The client's latest answer. It is stricter than the BRD's 24 hours, and the stricter value applies |

## Scope

- **Client portal and staff portal front ends:** static files built by `npm run build` / `npm run package:aws`. They hold no business data. To recover, redeploy the last release package, then restore `public/app-config.json`.
- **Business data:** the backend database and uploaded documents (OR/CR copies, receipts, contracts). The targets above apply to these.
- **Demo build:** the in-browser mock data is not backed up.

## To do at deployment

1. Configure daily automated backups to cloud storage, with 7 daily, 12 monthly and 2 semi-annual copies kept.
2. Run a restore exercise and record the measured time against the 1-hour RTO (BRD NFR-007 verification: recovery test).
3. If the business wants less than 24 hours of possible data loss, increase the backup frequency (for example hourly or point-in-time recovery). That would be a change to the targets above.
