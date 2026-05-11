---
"@storely/encrypt-node": minor
"@storely/encrypt-web": minor
---

**Cluster 6 — Encryption hardening.** Added `deriveKey()` PBKDF2 helpers to both `encrypt-node` and `encrypt-web` so password-derived keys go through a real KDF instead of bare SHA-256. AEAD detection hardened with an explicit ChaCha20-Poly1305 allowlist to avoid false positives on Node's loose `"stream"` mode label. AES-CBC docs now warn explicitly that it does not verify integrity.
