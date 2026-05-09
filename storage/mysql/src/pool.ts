import mysql, { type Pool } from "mysql2";

export const parseConnectionString = (connectionString: string) => {
	// Handle # character as URL breaks when it is present
	connectionString = connectionString.replace(/#/g, "%23");
	// Create a new URL object
	const url = new URL(connectionString);

	// Create the poolOptions object
	const poolOptions = {
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password) || undefined,
		host: url.hostname,
		port: url.port ? Number.parseInt(url.port, 10) : undefined,
		database: decodeURIComponent(url.pathname.slice(1)), // Remove the leading '/'
	};

	// Remove undefined properties
	for (const key of Object.keys(poolOptions)) {
		// @ts-expect-error - poolOptions
		if (poolOptions[key] === undefined) {
			//  @ts-expect-error
			delete poolOptions[key];
		}
	}

	return poolOptions;
};

/**
 * Create a per-instance mysql connection pool.
 *
 * Earlier revisions cached a single module-level pool keyed by URI. That
 * design leaked pools whenever two StorelyMysql instances were created in
 * the same process with different URIs (the second call replaced the
 * cached pool without ending the first), and it conflated multi-tenant
 * use cases. Each StorelyMysql instance now owns its own Pool and ends
 * it via `endPool` on disconnect.
 */
export const createPool = (uri: string, options: object = {}): Pool => {
	const connectObject = parseConnectionString(uri);
	const poolOptions = { ...connectObject, ...options };
	return mysql.createPool(poolOptions);
};

/**
 * Drain and close a pool, awaiting completion. Safe to call with `undefined`
 * (returns immediately).
 */
export const endPool = (pool: Pool | undefined): Promise<void> => {
	if (!pool) return Promise.resolve();
	return new Promise((resolve, reject) => {
		pool.end((err) => {
			if (err) reject(err);
			else resolve();
		});
	});
};
