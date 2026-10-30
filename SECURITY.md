# Security Policy

## Supported Versions

This project is currently maintained in its active development state. Security updates are applied as needed to the current main branch.

## Reporting a Vulnerability

Please report suspected security issues privately and responsibly.

- Do not open a public GitHub issue for security vulnerabilities.
- Use a private report channel or contact the maintainer directly.
- Include a concise description of the issue, affected paths, reproduction steps, and impact.

## Safe Handling

- Never commit real API keys, access tokens, or provider credentials.
- Keep secrets in local environment variables or hosted platform secret stores only.
- Review any environment or config files before publishing the repository.
- Prefer `.env.example` placeholders over real values.

## Best Practices

- Validate the app before deployment.
- Use `APP_ACCESS_CODE` when exposing the application to public traffic.
- Use rate limiting and server-side secret management for any production deployment.
