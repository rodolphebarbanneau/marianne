import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * A placeholder in angle brackets (marianne-service://<code>/, ?timecode=<ms>) outside backticks is an
 * HTML tag to a Markdown renderer: GitHub, the website and the app's guide drop it, and a tag left
 * open like <code> takes the rest of the page with it. Lists them in the repository's Markdown and
 * fails, so `npm run check` catches them: write them in a code span, or as &lt;code&gt;.
 * HTML comments and autolinks (<https://…>) are Markdown's own, and pass.
 */

const files = execFileSync('git', ['ls-files', '*.md', '*.mdx'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const TAG = /(?<!\\)<(\/?[A-Za-z][^<>\n]*)>/g
const found = []

for (const file of files) {
  let fence = null
  let comment = false
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const opens = line.trim().match(/^(`{3,}|~{3,})/)
      if (fence) {
        if (opens && opens[1][0] === fence[0] && opens[1].length >= fence.length) fence = null
        return
      }
      if (opens) {
        fence = opens[1]
        return
      }
      let text = line
      if (comment) {
        const end = text.indexOf('-->')
        if (end < 0) return
        comment = false
        text = text.slice(end + 3)
      }
      text = text.replace(/<!--.*?-->/g, '')
      const start = text.indexOf('<!--')
      if (start >= 0) {
        comment = true
        text = text.slice(0, start)
      }
      // Code spans, of one backtick or more, are Markdown's to show as they are.
      text = text.replace(/(`+)(.+?)\1/g, '')
      for (const m of text.matchAll(TAG)) if (!/^(https?|mailto):/.test(m[1])) found.push(`  ${file}:${i + 1}: <${m[1]}>`)
    })
}

if (found.length) {
  console.error(`Angle brackets outside code in Markdown, read as HTML tags (put them in backticks):\n${found.join('\n')}`)
  process.exit(1)
}
