import mysql from "mysql2/promise";
import { afterEach, describe, expect, test } from "vitest";
import StorelyMysql from "../src/index.js";

const uri = process.env.MYSQL_URL || "mysql://root@localhost:3306/storely_test";

describe("mysql MEDIUMBLOB migration", () => {
	const tablesToCleanup: string[] = [];

	afterEach(async () => {
		if (tablesToCleanup.length === 0) return;
		const conn = await mysql.createConnection(uri);
		for (const t of tablesToCleanup) {
			await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
		}
		await conn.end();
		tablesToCleanup.length = 0;
	});

	test("new tables are created with MEDIUMBLOB", async () => {
		const tableName = `storely_blob_${Date.now()}`;
		tablesToCleanup.push(tableName);
		const s = new StorelyMysql({ uri, table: tableName });
		await s.set("k", "v"); // Force schema creation
		const conn = await mysql.createConnection(uri);
		const [rows] = (await conn.query(
			`SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = 'value' AND TABLE_SCHEMA = DATABASE()`,
			[tableName],
		)) as [Array<{ DATA_TYPE: string }>, unknown];
		expect(rows[0].DATA_TYPE).toBe("mediumblob");
		await conn.end();
		await s.disconnect();
	});

	test("64KB value round-trips", async () => {
		const tableName = `storely_64k_${Date.now()}`;
		tablesToCleanup.push(tableName);
		const s = new StorelyMysql({ uri, table: tableName });
		const big = "x".repeat(64 * 1024);
		await s.set("k", big);
		expect(await s.get("k")).toBe(big);
		await s.disconnect();
	});

	test("legacy TEXT table is migrated to MEDIUMBLOB on connect", async () => {
		const tableName = `storely_legacy_${Date.now()}`;
		tablesToCleanup.push(tableName);
		const conn = await mysql.createConnection(uri);
		await conn.query(
			`CREATE TABLE \`${tableName}\` (id VARCHAR(255) NOT NULL, value TEXT, namespace VARCHAR(255) NOT NULL DEFAULT '', expires BIGINT UNSIGNED DEFAULT NULL, UNIQUE INDEX (id, namespace))`,
		);
		await conn.end();
		const s = new StorelyMysql({ uri, table: tableName });
		await s.set("k", "v"); // Triggers connect path
		const conn2 = await mysql.createConnection(uri);
		const [rows] = (await conn2.query(
			`SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = 'value' AND TABLE_SCHEMA = DATABASE()`,
			[tableName],
		)) as [Array<{ DATA_TYPE: string }>, unknown];
		expect(rows[0].DATA_TYPE).toBe("mediumblob");
		await conn2.end();
		await s.disconnect();
	});
});
