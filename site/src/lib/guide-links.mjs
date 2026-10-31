// The guide (docs/guide/<lang>/*.md) links its pages as files, which GitHub follows; on the site they
// are pages: fr/install.md is /guide/install/, en/install.md /en/guide/install/, and index.md the
// guide's first page. A link to one of the site's own pages (the manifesto) is written at the site's
// address, so that GitHub follows it too; on the site, it stays on the site, under its base. A link
// out of the guide (../design.md) goes to the file on GitHub, and links to other sites open in a new
// tab. A plugin of Sätteri, Astro's Markdown processor.

const DOCS = 'https://github.com/rodolphebarbanneau/marianne/blob/main/docs/'
// The site's address by default (astro.config.mjs): the one the guide writes its links to the site with.
const SITE = 'https://rodolphebarbanneau.github.io/marianne/'

export function guideLinks({ base = '/' } = {}) {
  const root = base.endsWith('/') ? base : base + '/'
  return {
    name: 'guide-links',
    element: {
      filter: ['a'],
      visit(node, ctx) {
        const href = node.properties?.href
        const lang = ctx.fileURL?.pathname.match(/\/guide\/(\w\w)\/[^/]+\.md$/)?.[1]
        if (typeof href !== 'string' || !lang) return
        if (href.startsWith(SITE)) {
          ctx.setProperty(node, 'href', root + href.slice(SITE.length))
          return
        }
        if (/^https?:/i.test(href)) {
          ctx.setProperty(node, 'target', '_blank')
          ctx.setProperty(node, 'rel', 'noopener')
          return
        }
        if (/^[a-z]+:|^#|^\//i.test(href)) return
        const [, file, hash = ''] = href.match(/^([^#]*)(#.*)?$/)
        const guide = root + (lang === 'fr' ? '' : lang + '/') + 'guide/'
        const to = /^[\w-]+\.md$/.test(file) ? guide + (file === 'index.md' ? '' : file.replace(/\.md$/, '/')) : new URL(file, DOCS + `guide/${lang}/`).href
        ctx.setProperty(node, 'href', to + hash)
      }
    }
  }
}
