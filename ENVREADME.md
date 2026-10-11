# Environment Configuration

Copy `.env.example` to `.env` for a local installation. Keep `.env` private and never commit populated secrets.

## Telegram

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot token issued by Telegram. |
| `TELEGRAM_CHAT_ID` | Chat identifier used by configured notifications. |

## GitHub

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Dedicated GitHub token used by the bot. Grant only the permissions the enabled actions require. |
| `GITHUB_USERNAME` | Account name used by the bot. |
| `GITHUB_PROFILE_REPO` | Optional/configured profile repository name. |

## Model providers and behavior

The template supports `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `TOGETHER_API_KEY`, and `MINIMAX_API_KEY`; configure only providers you use. `DEFAULT_MODEL` selects the configured model, and `MODEL_PRICING_URL` is optional.

Other template settings include `DEFAULT_TIMEZONE`, `NOTIFICATION_LEVEL`, `LLM_TIMEOUT_MS`, `ENABLE_DEFAULT_JOBS`, `AUTO_APPLY_LOW_RISK_PROFILE_UPDATES`, and `AUTO_CREATE_PROFILE_BLOCKS`. Their sample values and comments are in `.env.example`.

Never place real credentials in browser code, screenshots, issues, or pull requests. Restart the bot after changing configuration.