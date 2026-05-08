import { createConnection } from "node:net";

/** Probe a TCP host:port. Returns true if a connection succeeds within `timeoutMs`. */
export function probeTcp(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
	return new Promise((resolve) => {
		const sock = createConnection({ host, port });
		const done = (ok: boolean) => {
			sock.destroy();
			resolve(ok);
		};
		sock.setTimeout(timeoutMs);
		sock.once("connect", () => done(true));
		sock.once("timeout", () => done(false));
		sock.once("error", () => done(false));
	});
}
