# Security policy

Marianne keeps people's administrative lives in an encrypted archive on their computer, and lets an AI engine work on it. Security reports are among the most useful contributions it can get.

## Reporting a vulnerability

**Don't open a public issue.** Report it privately through GitHub: [report a vulnerability](https://github.com/rodolphebarbanneau/marianne/security/advisories/new) (the repository's Security tab). Only you and the maintainer, Rodolphe Barbanneau ([@rodolphebarbanneau](https://github.com/rodolphebarbanneau)), can read it.

Please include what you found, how to reproduce it, and what an attacker could do with it. Don't use real personal data to demonstrate it.

Marianne is maintained by one person and is in alpha: you'll get an answer as soon as possible, and we'll agree together on when the issue can be made public, once a fixed release is out. Reporters are credited in the advisory, unless they'd rather not be.

## Supported versions

Only the latest release gets security fixes. Marianne is in alpha (`0.1.x` pre-releases): update to the newest one before reporting.

## What's in scope

- **The archive**: each account is one file, encrypted with AES-256-GCM under a key derived from the passphrase by scrypt, or opened by a recovery key; the PIN that reopens it on one computer is sealed by the operating system's keystore.
- **The masking**: identifiers (social security number, tax number, names, address, IBAN…) are replaced by `[[tokens]]` before anything reaches an engine. Any way for an engine, a tool, a log or an export to see them in clear is a vulnerability.
- **The local MCP server** the engines talk to: it listens on 127.0.0.1 only and requires a token generated at each launch.
- **Approvals**: anything that changes the profile, fills a form, signs, pays or sends must go through the user's approval.
- **The services** (3615 add-ons): a service reads only the profile fields the user granted it, and its sync jobs reach only the hosts it declares.
- **The built-in browser**, the signed content bundles and the app's updates.

Out of scope: the engines themselves (Claude Code, Codex, Mistral Vibe; report to their makers), a computer already compromised, and attacks that need the user's passphrase.
