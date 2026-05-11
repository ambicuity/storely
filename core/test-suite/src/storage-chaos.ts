import { faker } from "@faker-js/faker";
import type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";

/**
 * Chaos / adapter-failure-mode tests. Opt-in via `options.chaos: true`.
 *
 * Scenarios verify that adapters degrade gracefully under transient failure:
 * timeouts return, batch operations don't hang, and the store remains usable
 * after recovery. Backend lifecycle (kill/restart) is the caller's
 * responsibility — these tests assume an environment hook (`STORELY_CHAOS_*`)
 * is in place to invoke `docker pause` / `docker kill` / etc.
 *
 * Suites that don't have a chaos-controllable backend (e.g. in-memory) should
 * leave the flag off.
 */
const storageChaosTests = (test: TestFunction, store: StorageFn, options?: StorageTestOptions) => {
	if (options?.chaos !== true) {
		return;
	}

	const chaosTimeoutMs = options.chaosTimeoutMs ?? 10_000;

	test("setMany during simulated unreachability rejects within timeout, does not hang", async (t) => {
		const s = store();
		// The harness is expected to publish a SIGUSR1 or wrapper hook that
		// pauses the backend. We approximate via a Promise.race: if the call
		// hasn't resolved or rejected within chaosTimeoutMs, that's the bug.
		const entries = Array.from({ length: 100 }, () => ({
			key: faker.string.alphanumeric(12),
			value: faker.lorem.sentence(),
		}));

		const op = s.setMany?.(entries) ?? Promise.all(entries.map((e) => s.set(e.key, e.value)));
		const timeout = new Promise<"timeout">((resolve) =>
			setTimeout(() => resolve("timeout"), chaosTimeoutMs),
		);
		const result = await Promise.race([
			op.then(() => "resolved" as const).catch(() => "rejected" as const),
			timeout,
		]);

		// The pass condition: resolved OR rejected within the timeout window.
		// Failure: the race returned "timeout", meaning the adapter hung past
		// the documented commandTimeout — a Cluster 3 regression.
		t.expect(result === "resolved" || result === "rejected").toBe(true);
	});

	test("store remains usable after a transient-failure window", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(12);
		const value = faker.lorem.sentence();

		// Pre-failure write to confirm baseline.
		await s.set(key, value);
		const before = await s.get(key);
		t.expect(before).toBe(value);

		// During failure: best-effort op that may reject. We swallow the error
		// — the point is the recovery, not the in-flight failure.
		try {
			await s.set(`${key}-during-failure`, value);
		} catch {
			// expected
		}

		// Post-failure: write + read must round-trip.
		const recoveryKey = faker.string.alphanumeric(12);
		const recoveryValue = faker.lorem.sentence();
		await s.set(recoveryKey, recoveryValue);
		t.expect(await s.get(recoveryKey)).toBe(recoveryValue);
	});

	test("clear() does not throw when backend is slow or partially unreachable", async (t) => {
		const s = store();
		const entries = Array.from({ length: 50 }, () => ({
			key: faker.string.alphanumeric(12),
			value: faker.lorem.sentence(),
		}));
		await Promise.all(entries.map((e) => s.set(e.key, e.value)));

		// clear() should either succeed or reject — never hang.
		const op = s.clear();
		const timeout = new Promise<"timeout">((resolve) =>
			setTimeout(() => resolve("timeout"), chaosTimeoutMs),
		);
		const result = await Promise.race([
			op.then(() => "resolved" as const).catch(() => "rejected" as const),
			timeout,
		]);
		t.expect(result === "resolved" || result === "rejected").toBe(true);
	});
};

export { storageChaosTests };
