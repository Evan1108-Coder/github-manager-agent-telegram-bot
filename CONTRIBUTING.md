# Contributing

Thanks for helping improve the GitHub Manager Agent Telegram Bot.

## Before submitting a change

- Read the project overview and setup instructions in [README.md](README.md).
- Keep changes focused, and update tests or documentation when behavior changes.
- Preserve approval gates for public-facing, destructive, or uncertain GitHub actions. Do not weaken safeguards without explicit tests and documentation.
- Never commit bot tokens, GitHub tokens, provider keys, user data, or a populated `.env` file.

## Validate

Use Node.js 22.5 or newer, then run:

```bash
npm test
npm run smoke
```

Do not make tests depend on real GitHub writes, Telegram messages, or paid model calls unless the test explicitly uses a safe mock or test account.

## Pull requests

Describe the behavior changed, relevant risks, and validation performed. Include screenshots or logs only after removing credentials and personal data.