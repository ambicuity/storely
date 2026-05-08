import { randomBytes } from "node:crypto";
import { faker } from "@faker-js/faker";
import { encryptionTestSuite } from "@storely/test-suite";
import { Storely } from "storely";
import { describe, expect, it } from "vitest";
import StorelyEncryptNode from "../src/index.js";

const secret = faker.string.alphanumeric(32);

// Standard encryption compliance tests
encryptionTestSuite(it, new StorelyEncryptNode({ key: secret }));

describe("StorelyEncryptNode", () => {
	describe("default aes-256-gcm", () => {
		it("should produce different ciphertext each time due to random IV", () => {
			const encryption = new StorelyEncryptNode({ key: secret });
			const data = faker.lorem.word();
			const encrypted1 = encryption.encrypt(data);
			const encrypted2 = encryption.encrypt(data);
			expect(encrypted1).not.toBe(encrypted2);
		});

		it("should throw on tampered ciphertext", () => {
			const encryption = new StorelyEncryptNode({ key: secret });
			const encrypted = encryption.encrypt(faker.lorem.sentence());
			const buffer = Buffer.from(encrypted, "base64");
			buffer[buffer.length - 1] ^= 0xff;
			const tampered = buffer.toString("base64");
			expect(() => encryption.decrypt(tampered)).toThrow();
		});

		it("should fail to decrypt with a different key", () => {
			const encryption1 = new StorelyEncryptNode({ key: faker.string.alphanumeric(20) });
			const encryption2 = new StorelyEncryptNode({ key: faker.string.alphanumeric(20) });
			const encrypted = encryption1.encrypt(faker.lorem.sentence());
			expect(() => encryption2.decrypt(encrypted)).toThrow();
		});
	});

	describe("key handling", () => {
		it("should accept a string key and derive via SHA-256", () => {
			const encryption = new StorelyEncryptNode({ key: faker.string.alphanumeric(48) });
			const data = faker.lorem.word();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should accept a 32-byte Buffer key", () => {
			const bufferKey = randomBytes(32);
			const encryption = new StorelyEncryptNode({ key: bufferKey });
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should throw if Buffer key has wrong length for aes-256-gcm", () => {
			const badKey = randomBytes(16);
			expect(() => new StorelyEncryptNode({ key: badKey })).toThrow("Key must be 32 bytes");
		});
	});

	describe("custom algorithms", () => {
		it("should work with aes-128-gcm", () => {
			const bufferKey = randomBytes(16);
			const encryption = new StorelyEncryptNode({ key: bufferKey, algorithm: "aes-128-gcm" });
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-192-gcm", () => {
			const bufferKey = randomBytes(24);
			const encryption = new StorelyEncryptNode({ key: bufferKey, algorithm: "aes-192-gcm" });
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-128-gcm using string key", () => {
			const encryption = new StorelyEncryptNode({
				key: faker.string.alphanumeric(16),
				algorithm: "aes-128-gcm",
			});
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with chacha20-poly1305", () => {
			const bufferKey = randomBytes(32);
			const encryption = new StorelyEncryptNode({ key: bufferKey, algorithm: "chacha20-poly1305" });
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-256-ccm", () => {
			const bufferKey = randomBytes(32);
			const encryption = new StorelyEncryptNode({ key: bufferKey, algorithm: "aes-256-ccm" });
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-256-cbc (non-AEAD)", () => {
			const bufferKey = randomBytes(32);
			const encryption = new StorelyEncryptNode({ key: bufferKey, algorithm: "aes-256-cbc" });
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should throw for unsupported algorithm", () => {
			expect(
				() =>
					new StorelyEncryptNode({
						key: faker.string.alphanumeric(16),
						algorithm: "invalid-algorithm",
					}),
			).toThrow("Unsupported cipher algorithm");
		});
	});

	describe("encoding option", () => {
		it("should support hex encoding", () => {
			const encryption = new StorelyEncryptNode({ key: secret, encoding: "hex" });
			const data = faker.lorem.sentence();
			const encrypted = encryption.encrypt(data);
			expect(/^[\da-f]+$/i.test(encrypted)).toBe(true);
			const decrypted = encryption.decrypt(encrypted);
			expect(decrypted).toBe(data);
		});
	});

	describe("Storely integration", () => {
		it("should work with Storely for complex objects", async () => {
			const encryption = new StorelyEncryptNode({ key: secret });
			const storely = new Storely({ encryption });
			const obj = {
				name: faker.person.fullName(),
				count: faker.number.int(100),
				nested: { a: faker.datatype.boolean() },
			};
			const key = faker.string.alphanumeric(10);
			await storely.set(key, obj);
			const result = await storely.get(key);
			expect(result).toEqual(obj);
		});

		it("should work with Storely and custom algorithm", async () => {
			const encryption = new StorelyEncryptNode({ key: secret, algorithm: "aes-128-gcm" });
			const storely = new Storely({ encryption });
			const key = faker.string.alphanumeric(10);
			const value = faker.lorem.word();
			await storely.set(key, value);
			const result = await storely.get(key);
			expect(result).toBe(value);
		});
	});
});
