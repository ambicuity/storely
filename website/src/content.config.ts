import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const docs = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/docs" }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		order: z.number().default(99),
		section: z.string().optional(),
	}),
});

const adapters = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/adapters" }),
	schema: z.object({
		title: z.string(),
		slug: z.string(),
		npm: z.string(),
		tier: z.enum(["production", "beta", "experimental"]),
		tagline: z.string(),
		source: z.string(),
	}),
});

const guides = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/guides" }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		order: z.number().default(99),
	}),
});

export const collections = { docs, adapters, guides };
