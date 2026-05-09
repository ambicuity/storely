# Security Policy

## Reporting a vulnerability

**Do not file public issues for vulnerabilities.** Public reports give attackers
a head start before a fix is available.

Use GitHub's private security advisory flow:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**, or follow this link directly:
   <https://github.com/jaredwray/storely/security/advisories/new>
   *(replace `jaredwray/storely` with the appropriate fork if reporting against one).*
3. Fill out the advisory form with:
   - **Vulnerability type** (e.g. injection, auth bypass, cryptographic weakness).
   - **Affected packages and versions** — which `@storely/*` package(s), and which version(s) you observed the issue on.
   - **Reproduction** — the smallest input that demonstrates the issue. A failing
     test or a code snippet is ideal.
   - **Impact** — what an attacker can do with this, and under what conditions.
   - **Suggested remediation** if you have one.

We will acknowledge the report, work on a fix in private, and publish a GitHub
Security Advisory (with credit, if you'd like) once a patched version is
released.

## Supported versions

The most recent minor release on `main` is supported. Older versions receive
fixes only for high-severity issues at the maintainers' discretion.

## Scope

In scope: all packages published from this repository (`storely`,
`@storely/*`). The website at `website/` is documentation; security issues with
the rendered docs site infrastructure should be reported to the hosting
provider.

Out of scope: third-party storage adapters or forks not maintained in this
repository.
