# Security Policy

## Supported versions

The project currently supports the latest `main` branch and the most recent released version on GitHub.

| Version | Supported |
| --- | --- |
| main / latest | Yes |
| older released versions | Limited support; please upgrade when possible |

## Reporting a vulnerability

If you discover a security issue in Mammoth Bots, please do not open a public GitHub issue.

Instead, report it privately by emailing the maintainer at `janardhans2416@gmail.com` with the subject line:

`[SECURITY] Mammoth Bots vulnerability report`

Please include:

- a clear description of the issue
- steps to reproduce it
- the affected component or endpoint
- the impact and severity you observed
- any suggested mitigation or patch
- your preferred contact method, if different from the email above

We aim to acknowledge valid reports within 5 business days and will work with you on a coordinated disclosure timeline.

## Disclosure expectations

- Please provide a reasonable amount of detail so we can validate the problem.
- Avoid sharing the vulnerability publicly until the maintainers have had time to assess and address it.
- If a fix is being prepared, we may coordinate a disclosure window with you.

## Security best practices

When contributing or running this project locally:

- keep Node.js and dependencies up to date
- use environment variables for API keys and never commit secrets
- avoid exposing backend tokens in client-side bundles
- run the app in a non-production environment when testing model integrations

Thank you for helping keep Mammoth Bots safe for everyone.
