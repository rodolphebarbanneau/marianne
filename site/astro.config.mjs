import { defineConfig } from 'astro/config'
import { satteri } from '@astrojs/markdown-satteri'
import { guideLinks } from './src/lib/guide-links.mjs'

// Published on GitHub Pages by default (rodolphebarbanneau.github.io/marianne); SITE_URL and BASE_PATH
// move it, to a domain of its own for instance (SITE_URL=https://marianne.example BASE_PATH=/).
const site = process.env.SITE_URL ?? 'https://rodolphebarbanneau.github.io'
const base = process.env.BASE_PATH ?? '/marianne'

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  markdown: {
    // The guide's pages link to each other as files (install.md): on the site, they're pages.
    processor: satteri({ hastPlugins: [guideLinks({ base })] })
  }
})
