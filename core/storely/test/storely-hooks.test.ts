import { faker } from "@faker-js/faker";
import * as test from "vitest";
import Storely, { StorelyHooks } from "../src/index.js";
import { createStore, delay } from "./test-utils.js";

test.it("BEFORE_SET hook", async (t) => {
	const storely = new Storely();
	storely.addHook(StorelyHooks.BEFORE_SET, (data) => {
		t.expect(data.key).toBe("foo");
		t.expect(data.value).toBe("bar");
	});
	t.expect(storely.getHooks(StorelyHooks.BEFORE_SET)?.length).toBe(1);
	await storely.set("foo", "bar");
});

test.it("BEFORE_SET hook with manipulation", async (t) => {
	const keyId = faker.string.alphanumeric(10);
	const newKeyId = `${keyId}1`;
	const keyValue = faker.lorem.sentence();
	const storely = new Storely();
	storely.addHook(StorelyHooks.BEFORE_SET, (data) => {
		data.key = newKeyId;
	});
	await storely.set(keyId, keyValue);
	t.expect(await storely.get(newKeyId)).toBe(keyValue);
});

test.it("AFTER_SET hook", async (t) => {
	const storely = new Storely();
	storely.addHook(StorelyHooks.AFTER_SET, (data) => {
		t.expect(data.key).toBe("foo");
		t.expect(data.value).toBe('{"value":"bar"}');
	});
	await storely.set("foo", "bar");
});

test.it("BEFORE_GET_MANY and manipulation", async () => {
	const storely = new Storely();
	storely.addHook(StorelyHooks.BEFORE_GET_MANY, (data) => {
		test.expect(data.keys[0]).toBe("foo");
		test.expect(data.keys[1]).toBe("foo1");
		data.keys[0] = "fake";
	});
	test.expect(storely.getHooks(StorelyHooks.BEFORE_GET_MANY)?.length).toBe(1);
	const values = await storely.get(["foo", "foo1"]);
	test.expect(values[0]).toBeUndefined();
});

test.it("AFTER_GET_MANY with and without getMany function", async () => {
	// Without getMany
	const storely = new Storely();
	await storely.set("foo", "bar");
	await storely.set("foo1", "bar1");
	storely.addHook(StorelyHooks.AFTER_GET_MANY, (data) => {
		test.expect(data[0]).toBe("bar");
		test.expect(data[1]).toBe("bar1");
	});
	await storely.get(["foo", "foo1"]);

	// With getMany and manipulation
	const storely2 = new Storely({ store: createStore() });
	await storely2.set("foo", "bar");
	await storely2.set("foo1", "bar1");
	storely2.addHook(StorelyHooks.AFTER_GET_MANY, (data) => {
		data[1] = "fake";
	});
	const values = await storely2.get(["foo", "foo1"]);
	test.expect(values[1]).toBe("fake");
});

test.it("BEFORE_DELETE and AFTER_DELETE hooks", async () => {
	const storely = new Storely();
	storely.addHook(StorelyHooks.BEFORE_DELETE, (data) => {
		test.expect(data.key).toBe("foo");
	});
	storely.addHook(StorelyHooks.AFTER_DELETE, (data) => {
		test.expect(data).toBeTruthy();
	});
	await storely.set("foo", "bar");
	await storely.delete("foo");
});

test.it("BEFORE_GET hook", async () => {
	const storely = new Storely();
	storely.addHook(StorelyHooks.BEFORE_GET, (data) => {
		test.expect(data.key).toBe("foo");
	});
	await storely.set("foo", "bar");
	await storely.get("foo");
});

test.it("AFTER_GET hook on hit, miss, and expired", async () => {
	const storely = new Storely();
	await storely.set("foo", "bar");

	// Hit
	// biome-ignore lint/suspicious/noExplicitAny: test hook data
	let hookData: any;
	storely.addHook(StorelyHooks.AFTER_GET, (data) => {
		hookData = data;
	});
	await storely.get("foo");
	test.expect(hookData.key).toBe("foo");
	test.expect(hookData.value).toEqual({ value: "bar" });

	// Miss
	await storely.get("nonexistent");
	test.expect(hookData.key).toBe("nonexistent");
	test.expect(hookData.value).toBeUndefined();

	// Expired
	await storely.set("exp", "val", 1);
	await delay(10);
	await storely.get("exp");
	test.expect(hookData.key).toBe("exp");
	test.expect(hookData.value).toBeUndefined();
});

test.it("AFTER_GET_RAW hook on hit, miss, and expired", async () => {
	const storely = new Storely();
	await storely.set("foo", "bar");

	// biome-ignore lint/suspicious/noExplicitAny: test hook data
	let hookData: any;
	storely.addHook(StorelyHooks.AFTER_GET_RAW, (data) => {
		hookData = data;
	});

	await storely.getRaw("foo");
	test.expect(hookData.key).toBe("foo");
	test.expect(hookData.value).toEqual({ value: "bar" });

	await storely.getRaw("nonexistent");
	test.expect(hookData.value).toBeUndefined();

	await storely.set("exp", "val", 1);
	await delay(10);
	await storely.getRaw("exp");
	test.expect(hookData.value).toBeUndefined();
});

test.it("deprecated hooks (PRE_SET, POST_SET, PRE_GET, POST_DELETE) still fire", async (t) => {
	const storely = new Storely();
	storely.on("warn", () => {});
	const fired: string[] = [];
	storely.addHook(StorelyHooks.PRE_SET, () => {
		fired.push("PRE_SET");
	});
	storely.addHook(StorelyHooks.POST_SET, () => {
		fired.push("POST_SET");
	});
	storely.addHook(StorelyHooks.PRE_GET, () => {
		fired.push("PRE_GET");
	});
	storely.addHook(StorelyHooks.POST_DELETE, () => {
		fired.push("POST_DELETE");
	});
	await storely.set("foo", "bar");
	await storely.get("foo");
	await storely.delete("foo");
	t.expect(fired).toEqual(["PRE_SET", "POST_SET", "PRE_GET", "POST_DELETE"]);
});

test.it("BEFORE_SET_MANY and AFTER_SET_MANY hooks with manipulation", async () => {
	const storely = new Storely();
	storely.addHook(StorelyHooks.BEFORE_SET_MANY, (data) => {
		test.expect(data.entries).toHaveLength(2);
		data.entries[0].value = "modified";
	});
	storely.addHook(StorelyHooks.AFTER_SET_MANY, (data) => {
		test.expect(data.entries).toHaveLength(2);
		test.expect(data.values).toEqual([true, true]);
	});
	await storely.setMany([
		{ key: "foo", value: "bar" },
		{ key: "foo1", value: "bar1" },
	]);
	const values = await storely.get(["foo", "foo1"]);
	test.expect(values[0]).toBe("modified");
	test.expect(values[1]).toBe("bar1");
});

test.it("BEFORE_DELETE_MANY, AFTER_DELETE_MANY, and legacy hooks for deleteMany", async (t) => {
	const storely = new Storely();
	const fired: string[] = [];
	storely.addHook(StorelyHooks.BEFORE_DELETE_MANY, (data) => {
		test.expect(data.keys).toEqual(["foo", "foo1"]);
		fired.push("BEFORE_DELETE_MANY");
	});
	storely.addHook(StorelyHooks.AFTER_DELETE_MANY, (data) => {
		test.expect(data.values).toEqual([true, true]);
		fired.push("AFTER_DELETE_MANY");
	});
	storely.addHook(StorelyHooks.BEFORE_DELETE, () => {
		fired.push("BEFORE_DELETE");
	});
	storely.addHook(StorelyHooks.AFTER_DELETE, () => {
		fired.push("AFTER_DELETE");
	});
	await storely.set("foo", "bar");
	await storely.set("foo1", "bar1");
	await storely.delete(["foo", "foo1"]);
	t.expect(fired).toContain("BEFORE_DELETE_MANY");
	t.expect(fired).toContain("AFTER_DELETE_MANY");
	t.expect(fired).toContain("BEFORE_DELETE");
	t.expect(fired).toContain("AFTER_DELETE");
});

test.it("BEFORE_CLEAR and AFTER_CLEAR hooks with namespace", async (t) => {
	const storely = new Storely({ namespace: "test-ns" });
	// biome-ignore lint/suspicious/noExplicitAny: test hook data
	let beforeData: any;
	// biome-ignore lint/suspicious/noExplicitAny: test hook data
	let afterData: any;
	let valueBeforeClear: string | undefined;
	storely.addHook(StorelyHooks.BEFORE_CLEAR, async (data) => {
		beforeData = data;
		valueBeforeClear = await storely.get("foo");
	});
	storely.addHook(StorelyHooks.AFTER_CLEAR, (data) => {
		afterData = data;
	});
	await storely.set("foo", "bar");
	await storely.clear();
	t.expect(beforeData.namespace).toBe("test-ns");
	t.expect(afterData.namespace).toBe("test-ns");
	t.expect(valueBeforeClear).toBe("bar");

	// Without namespace
	const storely2 = new Storely();
	// biome-ignore lint/suspicious/noExplicitAny: test hook data
	let ns: any;
	storely2.addHook(StorelyHooks.BEFORE_CLEAR, (data) => {
		ns = data.namespace;
	});
	await storely2.clear();
	t.expect(ns).toBeUndefined();
});

test.it("BEFORE_DISCONNECT and AFTER_DISCONNECT hooks with namespace", async (t) => {
	const storely = new Storely({ namespace: "test-ns" });
	// biome-ignore lint/suspicious/noExplicitAny: test hook data
	let beforeData: any;
	// biome-ignore lint/suspicious/noExplicitAny: test hook data
	let afterData: any;
	storely.addHook(StorelyHooks.BEFORE_DISCONNECT, (data) => {
		beforeData = data;
	});
	storely.addHook(StorelyHooks.AFTER_DISCONNECT, (data) => {
		afterData = data;
	});
	await storely.disconnect();
	t.expect(beforeData.namespace).toBe("test-ns");
	t.expect(afterData.namespace).toBe("test-ns");

	// Without namespace
	const storely2 = new Storely();
	// biome-ignore lint/suspicious/noExplicitAny: test hook data
	let ns: any;
	storely2.addHook(StorelyHooks.BEFORE_DISCONNECT, (data) => {
		ns = data.namespace;
	});
	await storely2.disconnect();
	t.expect(ns).toBeUndefined();
});
