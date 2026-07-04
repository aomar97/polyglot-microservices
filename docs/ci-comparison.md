# CI comparison: GitHub Actions vs GitLab CI vs Jenkins

All three implement the identical pipeline for the same three services:

```
lint + test  →  build  →  Trivy scan (gate)  →  SBOM (syft)  →  Cosign sign  →  push  →  GitOps bump
```

The point isn't which is "best" — it's that the delivery *shape* is portable, and each
tool has ergonomic trade-offs.

## Polyglot fan-out

- **GitHub Actions** — one `strategy.matrix` job; language toolchains chosen with `if:` on a
  `lang` matrix field. Readable, but per-language `if` steps add noise.
- **GitLab CI** — natural fit: a dedicated `*:test` job per language (each with its own
  `image:`), plus a `parallel: matrix` for the build/scan fan-out across services.
- **Jenkins** — `parallel { ... }` for the three test stages (each on its own `docker` agent),
  and a `matrix { axes { SERVICE } }` for build/scan/sign/push.

## Caching

- **GitHub Actions** — Buildx with `cache-from/to: type=gha` (first-class, free).
- **GitLab CI** — registry layer cache or DinD cache; a bit more manual.
- **Jenkins** — depends on agent/workspace strategy; most flexible, least batteries-included.

## Secrets & keyless signing

- **GitHub Actions** — `permissions: id-token: write` gives an OIDC token Cosign uses directly.
- **GitLab CI** — `id_tokens: { SIGSTORE_ID_TOKEN: { aud: sigstore } }`.
- **Jenkins** — via a plugin-provided OIDC token or stored credentials.

## Registry

- **GitHub Actions** → GHCR with the built-in `GITHUB_TOKEN`.
- **GitLab CI** → GitLab Container Registry via `$CI_REGISTRY_*`.
- **Jenkins** → any registry through the credentials plugin.

## When I'd reach for each

| Situation | Pick |
|---|---|
| Code already on GitHub, want zero-setup OSS CI | **GitHub Actions** |
| All-in-one GitLab (SCM + CI + registry + packages) | **GitLab CI** |
| On-prem / regulated, or heavy build farms on Kubernetes | **Jenkins** (ties into Repo 6) |

## Honest gotchas

- **Jenkins** carries the most operational weight (you run the controller + agents) but pays off
  with k8s-native ephemeral agents at scale.
- **GitLab** shared runners + DinD can be slow; self-hosted runners fix it (and double as the
  Repo 6 story).
- **GitHub Actions** is the smoothest here because the repos live on GitHub and signing/registry
  are first-party.
