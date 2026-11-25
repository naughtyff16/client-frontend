# Backup and recovery targets — Delbros portals

Source: Client Portal Document 3, point 7 (business owners' answer, 25-Nov-2026). Status: **recorded, to confirm before configuration.**

## What the client supplied

| Item | Client wording | Recorded reading |
|---|---|---|
| Backup retention | "RPO - 7days + 12x Monthly +2x semi-annual" | Keep daily backups for 7 days, 12 monthly backups and 2 semi-annual backups. This is a retention schedule. It is not yet a data-loss limit (see the questions below). |
| Recovery time objective (RTO) | "RTO - 1hr" | After an outage, service is restored within 1 hour. |
| Deployment model | Not stated | Open |

## Scope

- **Client portal and staff portal front ends:** static files built by `npm run build` / `npm run package:aws`. They hold no business data. To recover, redeploy the last release package, then restore `public/app-config.json`.
- **Business data:** the backend database and uploaded documents (OR/CR copies, receipts, contracts). It lives outside this repository, so the retention schedule and the 1-hour RTO apply there.
- **Demo build:** the in-browser mock data is not backed up.

## Questions to confirm before configuration

1. **Recovery point objective (RPO).** What is the most data the business can afford to lose? The answer sets how often backups run, for example every 24 hours, every hour, or continuous point-in-time recovery.
2. **What "7 days" means.** Is it daily backups kept for 7 days, or one backup every 7 days?
3. **Monthly and semi-annual copies.** Which day is kept each month and each half-year, and where are the copies stored (same region, another region, or offline)?
4. **Deployment model.** Cloud (for example AWS, which matches the current `package:aws` packaging), on-premises or hybrid.
5. **Proof of the 1-hour RTO.** Run a restore exercise once the environment exists, and record the measured time.
