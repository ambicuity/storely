import { faker } from "@faker-js/faker";
import type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";

/**
 * Registers concurrency / interleaving tests on a storage adapter. Opt-in via
 * `options.concurrency: true` because not every backend can sustain heavy
 * parallel load in the standard test environment. Tests verify that the
 * adapter remains internally consistent under concurrent operations — they
 * intentionally do NOT assert specific orderings (last-write-wins races are
 * tolerated).
 */
const storageConcurrencyTests = (
	test: TestFunction,
	store: StorageFn,
	options?: StorageTestOptions,
) => {
	if (options?.concurrency !== true) {
		return;
	}

	test("concurrent set then concurrent get of 100 distinct keys", async (t) => {
		const s = store();
		const entries: Array<[string, string]> = Array.from({ length: 100 }, () => [
			faker.string.alphanumeric(12),
			faker.lorem.sentence(),
		]);

		await Promise.all(entries.map(([k, v]) => s.set(k, v)));
		const results = await Promise.all(entries.map(([k]) => s.get(k)));

		for (let i = 0; i < entries.length; i++) {
			t.expect(results[i]).toBe(entries[i][1]);
		}
	});

	test("interleaved set+delete on the same key leaves consistent state", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(12);
		const value = faker.lorem.sentence();

		const ops: Promise<unknown>[] = [];
		for (let i = 0; i < 50; i++) {
			ops.push(s.set(key, value));
			ops.push(s.delete(key));
		}

		await Promise.all(ops);

		// Final state is racy, but a follow-up has/get must agree with each
		// other — either both report present, or both report absent.
		const present = (await s.has?.(key)) ?? false;
		const value2 = await s.get(key);
		if (present) {
			t.expect(value2).toBe(value);
		} else {
			t.expect(value2 === undefined || value2 === null).toBe(true);
		}
	});

	test("setMany racing clear() does not throw or wedge the store", async (t) => {
		const s = store();
		const entries: Array<{ key: string; value: string }> = Array.from({ length: 100 }, () => ({
			key: faker.string.alphanumeric(12),
			value: faker.lorem.sentence(),
		}));

		await Promise.all([
			s.setMany?.(entries) ?? Promise.all(entries.map((e) => s.set(e.key, e.value))),
			s.clear(),
		]);

		// Store must remain usable. Round-trip a fresh key.
		const probeKey = faker.string.alphanumeric(12);
		const probeValue = faker.lorem.sentence();
		await s.set(probeKey, probeValue);
		t.expect(await s.get(probeKey)).toBe(probeValue);
	});
};

export { storageConcurrencyTests };
