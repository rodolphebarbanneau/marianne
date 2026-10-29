import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

// The user guide, as the repository keeps it (docs/guide/<lang>/<page>.md): the site renders the same
// files, so a change to the guide is a change to the site. The ids are the paths, fr/install.
const guide = defineCollection({
  loader: glob({ pattern: '{fr,en}/*.md', base: '../docs/guide', generateId: ({ entry }) => entry.replace(/\.md$/, '') })
})

export const collections = { guide }
