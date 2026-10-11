# Security Policy

This bot can hold Telegram, GitHub, and model-provider credentials and can perform repository actions. Treat its configuration and runtime data as sensitive.

## Reporting a vulnerability

Do not report exploitable details in a public issue. Use GitHub's private vulnerability reporting for this repository if it is enabled. Otherwise, contact the repository owner privately through GitHub and include the affected version or commit, impact, and minimal reproduction steps. Do not include live tokens or private user data in the report.

## Safe handling

- Keep populated environment files, bot databases, logs, and approval records out of Git.
- Use a dedicated GitHub token with only the permissions needed; do not grant destructive permissions without a clear need.
- Rotate any credential that may have been exposed.