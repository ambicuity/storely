import Storely from "@ambicuity/storely-core";
import { faker } from "@faker-js/faker";
import { it } from "vitest";
import StorelySqlite from "../src/index.js";

it("Async Iterator with Storely", async (t) => {
	const store = new StorelySqlite({
		uri: "sqlite://test/testdb2.sqlite",
		busyTimeout: 3000,
	});
	const storely = new Storely({ store });
	await storely.clear();
	// Test with Storely instance
	const storelyData = {
		key: faker.string.alphanumeric(10),
		value: faker.string.alphanumeric(10),
	};
	await storely.set(storelyData.key, storelyData.value);
	const storelyResult = await storely.get(storelyData.key);
	t.expect(storelyResult).toBe(storelyData.value);
	// Ensure the Storely instance can still use the iterator
	t.expect(storely.iterator).toBeDefined();
	if (typeof storely.iterator === "function") {
		const storelyIterator = storely.iterator();
		let storelyDataFound = false;
		for await (const [key, raw] of storelyIterator) {
			t.expect(key).toBe(storelyData.key);
			t.expect(raw).toBe(storelyData.value);
			storelyDataFound = true;
		}

		if (!storelyDataFound) {
			t.expect.fail("Storely iterator did not find the expected data");
		}
	} else {
		t.expect.fail("Storely iterator is not a function");
	}
});

it("Async Iterator with Storely and no namespace", async (t) => {
	const store = new StorelySqlite({
		uri: "sqlite://test/testdb2.sqlite",
		busyTimeout: 3000,
	});
	const storely = new Storely({ store });
	storely.namespace = undefined;
	await storely.clear();
	// Test with Storely instance
	const storelyData = {
		key: faker.string.alphanumeric(10),
		value: faker.string.alphanumeric(10),
	};
	await storely.set(storelyData.key, storelyData.value);
	const storelyResult = await storely.get(storelyData.key);
	t.expect(storelyResult).toBe(storelyData.value);
	// Ensure the Storely instance can still use the iterator
	t.expect(storely.iterator).toBeDefined();
	if (typeof storely.iterator === "function") {
		const storelyIterator = storely.iterator();
		let storelyDataFound = false;
		for await (const [key, raw] of storelyIterator) {
			t.expect(key).toBe(storelyData.key);
			t.expect(raw).toBe(storelyData.value);
			storelyDataFound = true;
		}

		if (!storelyDataFound) {
			t.expect.fail("Storely iterator did not find the expected data");
		}
	} else {
		t.expect.fail("Storely iterator is not a function");
	}
});
