import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://storely.org",
	integrations: [mdx(), sitemap()],
	markdown: {
		shikiConfig: {
			theme: "min-light",
			wrap: false,
		},
	},
	build: {
		assets: "_assets",
	},
});
