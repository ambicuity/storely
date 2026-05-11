import {
	type CipherGCM,
	createCipheriv,
	createDecipheriv,
	createHash,
	type DecipherGCM,
	getCipherInfo,
	pbkdf2Sync,
	randomBytes,
} from "node:crypto";
import type { StorelyEncryptionAdapter } from "storely";

/**
 * Set of cipher modes recognized as AEAD via Node's `getCipherInfo().mode`.
 * GCM and CCM both report cleanly via mode. ChaCha20-Poly1305 is also AEAD
 * but Node reports its mode as "stream" — same label as some non-AEAD
 * stream ciphers — so we additionally check the algorithm name explicitly
 * against a known-AEAD allowlist.
 */
const AEAD_MODES = new Set(["gcm", "ccm"]);
const CCM_MODES = new Set(["ccm"]);
const KNOWN_AEAD_ALGORITHMS = new Set(["chacha20-poly1305"]);

const AUTH_TAG_LENGTH = 16;

/**
 * PBKDF2 iteration count. 600k matches OWASP's 2024 Password Storage Cheat
 * Sheet minimum for PBKDF2-SHA256. Older callers that need to decrypt data
 * derived at the previous default (100k) must pass `iterations: 100_000`
 * explicitly to {@link deriveKey} — derived keys are stored as raw bytes,
 * so the caller is responsible for tracking which iteration count produced
 * each key.
 */
const DEFAULT_PBKDF2_ITERATIONS = 600_000;

/**
 * 4-byte ASCII magic ("STv0") prefixed to every new ciphertext envelope.
 * Provides a forward-compatibility marker so future wire-format changes
 * can dispatch on a version. Absent prefix is treated as legacy (pre-Cluster-8)
 * format during decryption — see {@link StorelyEncryptNode.decrypt}.
 */
const ENVELOPE_MAGIC_V0 = Buffer.from("STv0", "ascii");

/**
 * Options for {@link StorelyEncryptNode}.
 */
export type StorelyEncryptNodeOptions = {
	/**
	 * Encryption key. Strings are SHA-256-hashed and truncated to the
	 * algorithm's key length — this only normalises *length*, it does
	 * not stretch entropy. **Do not pass raw user passwords.** For
	 * password-derived keys, call {@link deriveKey} first and pass the
	 * resulting Buffer.
	 *
	 * Buffer keys must already be exactly the algorithm's key length.
	 */
	key: string | Buffer;
	/** Cipher algorithm to use. Any algorithm supported by Node.js `crypto.getCipherInfo()`. @defaultValue `"aes-256-gcm"` */
	algorithm?: string;
	/** Output encoding for the encrypted string. @defaultValue `"base64"` */
	encoding?: BufferEncoding;
};

/**
 * Derive a 32-byte key from a password and salt using PBKDF2-SHA256.
 *
 * Use this when the only "key material" you have is a user-supplied
 * password or other low-entropy string. Passing such inputs directly
 * to the {@link StorelyEncryptNode} constructor is unsafe; SHA-256 is
 * not a key derivation function and provides no work-factor against
 * brute force.
 *
 * @param password - The password or passphrase to stretch.
 * @param salt - A salt value. Must be unique per key; store alongside the
 *   ciphertext or in a separate config so you can re-derive on decrypt.
 *   At least 16 bytes recommended.
 * @param iterations - PBKDF2 iteration count. Defaults to 600,000 (OWASP
 *   2024 minimum for PBKDF2-SHA256). Callers that need to decrypt data
 *   produced with the previous default (100,000) must pass `iterations:
 *   100_000` explicitly — derived keys are stored as raw bytes, so the
 *   caller must remember which iteration count produced each key.
 * @param length - Output key length in bytes. Defaults to 32 (AES-256).
 * @returns A Buffer of `length` bytes suitable for use as `options.key`.
 */
export function deriveKey(
	password: string,
	salt: string | Buffer,
	iterations: number = DEFAULT_PBKDF2_ITERATIONS,
	length = 32,
): Buffer {
	return pbkdf2Sync(password, salt, iterations, length, "sha256");
}

/**
 * Node.js `crypto`-based encryption adapter for Storely.
 *
 * Encrypts and decrypts string values using any cipher supported by the
 * Node.js `crypto` module. Defaults to AES-256-GCM with authenticated
 * encryption. The encrypted output is a base64 string containing the IV,
 * authentication tag (for AEAD ciphers), and ciphertext.
 *
 * Wire format (v0, AEAD): `["STv0" (4 bytes) || IV || AuthTag (16 bytes) || Ciphertext]`
 * Wire format (v0, non-AEAD): `["STv0" (4 bytes) || IV || Ciphertext]`
 *
 * The 4-byte ASCII magic `STv0` identifies the envelope version. Ciphertexts
 * written by older releases (no magic) are accepted on decrypt for backward
 * compatibility. New writes always include the magic so future versions can
 * dispatch on it.
 *
 * **Authentication:** AES-CBC and other non-AEAD ciphers do **not**
 * verify integrity. An attacker who can modify ciphertext can flip
 * plaintext bits without detection. Prefer AES-GCM or another AEAD mode.
 *
 * **Key rotation:** the magic prefix carries a version, but key material is
 * not embedded. To rotate keys, decrypt all stored values with the old key
 * and re-encrypt with the new key. Plan this into operational procedures.
 *
 * @example
 * ```ts
 * import Storely from "storely";
 * import StorelyEncryptNode, { deriveKey } from "@storely/encrypt-node";
 *
 * // Direct key (32 random bytes from a key management system):
 * const encryption = new StorelyEncryptNode({ key: keyBuffer });
 *
 * // Password-derived key (always use deriveKey, never pass the password):
 * const key = deriveKey(userPassword, storedSalt);
 * const encryption = new StorelyEncryptNode({ key });
 *
 * const storely = new Storely({ encryption });
 * await storely.set("foo", "bar");
 * ```
 */
export class StorelyEncryptNode implements StorelyEncryptionAdapter {
	private readonly _key: Buffer;
	private readonly _algorithm: string;
	private readonly _encoding: BufferEncoding;
	private readonly _ivLength: number;
	private readonly _isAead: boolean;
	private readonly _isCcm: boolean;

	/**
	 * Creates a new encryption adapter.
	 * @param options - Configuration options including key, algorithm, and encoding.
	 * @throws If the algorithm is not supported by Node.js crypto.
	 * @throws If a Buffer key does not match the expected length for the algorithm.
	 */
	constructor(options: StorelyEncryptNodeOptions) {
		this._algorithm = (options.algorithm ?? "aes-256-gcm").toLowerCase();
		this._encoding = options.encoding ?? "base64";

		const info = getCipherInfo(this._algorithm);
		if (!info) {
			throw new Error(`Unsupported cipher algorithm: ${this._algorithm}`);
		}

		const mode = info.mode ?? "";
		this._ivLength = info.ivLength ?? 12;
		this._isAead = AEAD_MODES.has(mode) || KNOWN_AEAD_ALGORITHMS.has(this._algorithm);
		this._isCcm = CCM_MODES.has(mode);

		if (Buffer.isBuffer(options.key)) {
			if (options.key.length !== info.keyLength) {
				throw new Error(`Key must be ${info.keyLength} bytes for ${this._algorithm}`);
			}

			this._key = options.key;
		} else {
			// String keys are SHA-256-hashed and truncated to the algorithm's
			// key length. This only normalises length — it does not stretch
			// entropy. Callers passing user-supplied passwords should use
			// `deriveKey()` first.
			const hash = createHash("sha256").update(options.key).digest();
			this._key = hash.subarray(0, info.keyLength);
		}
	}

	/**
	 * Encrypts a plaintext string.
	 * @param data - The plaintext string to encrypt.
	 * @returns The encrypted string encoded with the configured encoding.
	 */
	encrypt(data: string): string {
		const iv = randomBytes(this._ivLength);
		const cipherOptions = this._isCcm
			? ({ authTagLength: AUTH_TAG_LENGTH } as Record<string, unknown>)
			: undefined;
		const cipher = createCipheriv(this._algorithm, this._key, iv, cipherOptions);

		if (this._isCcm) {
			const plaintextLength = Buffer.byteLength(data, "utf8");
			(cipher as unknown as CipherGCM).setAAD(Buffer.alloc(0), { plaintextLength });
		}

		const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);

		if (this._isAead) {
			const authTag = (cipher as unknown as CipherGCM).getAuthTag();
			const packed = Buffer.concat([ENVELOPE_MAGIC_V0, iv, authTag, encrypted]);
			return packed.toString(this._encoding);
		}

		const packed = Buffer.concat([ENVELOPE_MAGIC_V0, iv, encrypted]);
		return packed.toString(this._encoding);
	}

	/**
	 * Decrypts an encrypted string back to its original plaintext.
	 * @param data - The encrypted string to decrypt.
	 * @returns The original plaintext string.
	 * @throws If the ciphertext has been tampered with (AEAD modes).
	 * @throws If the wrong key is used for decryption.
	 */
	decrypt(data: string): string {
		const raw = Buffer.from(data, this._encoding);
		// Strip the v0 magic prefix if present. Absent magic means the
		// ciphertext predates Cluster 8; decode using the legacy layout.
		const hasMagic =
			raw.length >= ENVELOPE_MAGIC_V0.length &&
			raw.subarray(0, ENVELOPE_MAGIC_V0.length).equals(ENVELOPE_MAGIC_V0);
		const packed = hasMagic ? raw.subarray(ENVELOPE_MAGIC_V0.length) : raw;

		if (this._isAead) {
			const iv = packed.subarray(0, this._ivLength);
			const authTag = packed.subarray(this._ivLength, this._ivLength + AUTH_TAG_LENGTH);
			const encrypted = packed.subarray(this._ivLength + AUTH_TAG_LENGTH);
			const decipherOptions = this._isCcm
				? ({ authTagLength: AUTH_TAG_LENGTH } as Record<string, unknown>)
				: undefined;
			const decipher = createDecipheriv(this._algorithm, this._key, iv, decipherOptions);
			(decipher as unknown as DecipherGCM).setAuthTag(authTag);

			if (this._isCcm) {
				(decipher as unknown as DecipherGCM).setAAD(Buffer.alloc(0), {
					plaintextLength: encrypted.length,
				});
			}

			const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
			return decrypted.toString("utf8");
		}

		const iv = packed.subarray(0, this._ivLength);
		const encrypted = packed.subarray(this._ivLength);
		const decipher = createDecipheriv(this._algorithm, this._key, iv);
		const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
		return decrypted.toString("utf8");
	}
}

export default StorelyEncryptNode;
