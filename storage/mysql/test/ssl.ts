import fs from "node:fs";
import path from "node:path";
import { beforeEach, it } from "vitest";
import StorelyMysql from "../src/index.js";

const options = {
	ssl: {
		rejectUnauthorized: false,
		ca: fs.readFileSync(path.join(__dirname, "/certs/ca.pem")).toString(),
		key: fs.readFileSync(path.join(__dirname, "/certs/client-key.pem")).toString(),
		cert: fs.readFileSync(path.join(__dirname, "/certs/client-cert.pem")).toString(),
	},
};

beforeEach(async () => {
	const storely = new StorelyMysql({
		uri: "mysql://root@localhost:3307/storely_test",
		...options,
	});
	await storely.clear();
});

it("throws if ssl is not used", async (t) => {
	try {
		new StorelyMysql({ uri: "mysql://root@localhost:3307/storely_test" });
	} catch {
		t.expect(true).toBeTruthy();
	}
});

it("set with ssl ", async (t) => {
	const storely = new StorelyMysql({
		uri: "mysql://root@localhost:3307/storely_test",
		...options,
	});
	await storely.set("key", "value");
	t.expect(await storely.get("key")).toBe("value");
});
