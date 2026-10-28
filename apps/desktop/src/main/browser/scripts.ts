/**
 * Scripts run in the pages of the built-in browser. They only read and fill what is visible,
 * never password, file or hidden fields, and never submit anything by themselves.
 */

/** Fill the login form of a page: the password field and the username field before it. */
export const FILL_SCRIPT = (username: string, password: string) => `(() => {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden'
  const set = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const inputs = [...document.querySelectorAll('input')].filter((i) => visible(i) && !i.disabled && !i.readOnly)
  const pwd = inputs.find((i) => i.type === 'password')
  const textual = (i) => ['text', 'email', 'tel', 'number', ''].includes(i.type)
  const user = inputs.find((i) => /username|email/.test(i.autocomplete || '')) || (pwd ? inputs.slice(0, inputs.indexOf(pwd)).reverse() : inputs).find(textual)
  const filled = []
  if (user && ${JSON.stringify(username)}) { set(user, ${JSON.stringify(username)}); filled.push('identifiant') }
  if (pwd && ${JSON.stringify(password)}) { set(pwd, ${JSON.stringify(password)}); filled.push('mot de passe') }
  ;(pwd || user)?.focus()
  return filled
})()`

export const READ_SCRIPT = `(() => ({ title: document.title, url: location.href, text: (document.body && document.body.innerText) || '' }))()`

export interface FormField {
  id: string
  label: string
  type: string
  required: boolean
  value: string
  options?: string[]
}

/**
 * The fields of the form on the page, each tagged with a data-marianne-field id. Passwords, files
 * and buttons are left out: they are never filled.
 */
export const FORM_READ_SCRIPT = `(() => {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden'
  const text = (el) => (el ? (el.innerText || el.textContent || '') : '').replace(/\\s+/g, ' ').trim()
  const labelOf = (el) => {
    const byFor = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean)
    const labelled = ids.map((i) => text(document.getElementById(i))).join(' ')
    return (text(byFor) || text(el.closest('label')) || el.getAttribute('aria-label') || labelled || el.placeholder || el.title || el.name || '').slice(0, 140)
  }
  const skip = ['hidden', 'password', 'file', 'submit', 'button', 'image', 'reset']
  // Shown passwords (type switched to text), one-time codes, captchas, card codes.
  const secret = (el) =>
    /password|one-time-code|cc-/i.test(el.getAttribute('autocomplete') || '') ||
    /pass(?!eport)|mot.?de.?passe|pwd|\\botp|captcha|code.?de.?s[ée]curit|cvv|cvc|cryptogramme/i.test([el.name, el.id, labelOf(el)].join(' '))
  const fields = []
  const groups = new Map()
  let n = 0
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (skip.includes(el.type) || el.disabled || !visible(el) || secret(el)) continue
    if (el.type === 'radio') {
      const key = el.name || 'radio' + n
      let g = groups.get(key)
      if (!g) {
        g = { id: 'f' + ++n, label: text(el.closest('fieldset')?.querySelector('legend')) || el.name, type: 'radio', required: el.required, value: '', options: [] }
        groups.set(key, g)
        fields.push(g)
      }
      el.setAttribute('data-marianne-field', g.id)
      const option = labelOf(el) || el.value
      g.options.push(option)
      if (el.checked) g.value = option
      continue
    }
    const id = 'f' + ++n
    el.setAttribute('data-marianne-field', id)
    fields.push({
      id,
      label: labelOf(el),
      type: el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.type || 'text',
      required: el.required,
      value: el.type === 'checkbox' ? String(el.checked) : el.value,
      options: el.tagName === 'SELECT' ? [...el.options].map((o) => text(o) || o.value) : undefined
    })
  }
  return fields
})()`

/** Fill tagged fields; values of radios and selects match an option's label or value. */
export const FORM_FILL_SCRIPT = (values: Record<string, string>) => `(() => {
  const values = ${JSON.stringify(values)}
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase()
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden'
  const filled = []
  const missing = []
  for (const [id, value] of Object.entries(values)) {
    const els = [...document.querySelectorAll('[data-marianne-field="' + id + '"]')]
    const el = els[0]
    if (!el || el.type === 'password' || el.type === 'file' || el.type === 'hidden' || !visible(el)) { missing.push(id); continue }
    if (el.type === 'radio') {
      const target = els.find((r) => norm(r.value) === norm(value) || norm((r.labels && r.labels[0] && r.labels[0].innerText) || r.closest('label')?.innerText) === norm(value))
      if (!target) { missing.push(id); continue }
      target.click()
    } else if (el.type === 'checkbox') {
      const on = ['true', 'oui', '1', 'x'].includes(norm(value))
      if (el.checked !== on) el.click()
    } else if (el.tagName === 'SELECT') {
      const option = [...el.options].find((o) => norm(o.value) === norm(value) || norm(o.text) === norm(value))
      if (!option) { missing.push(id); continue }
      el.value = option.value
      fire(el)
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
      fire(el)
    }
    filled.push(id)
  }
  return { filled, missing }
})()`

/**
 * What the engine can act on: links, buttons and fields, each tagged with a data-marianne-el id,
 * with the page's visible text (clipped). Password fields are listed but never readable.
 */
export const PAGE_READ_SCRIPT = `(() => {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden'
  const text = (el) => (el ? (el.innerText || el.textContent || '') : '').replace(/\\s+/g, ' ').trim()
  const elements = []
  let n = 0
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role=button], [role=link], [role=checkbox], [role=tab], [onclick]')) {
    if (!visible(el) || el.disabled || el.type === 'hidden') continue
    const id = 'e' + ++n
    el.setAttribute('data-marianne-el', id)
    const role = el.getAttribute('role') || (el.tagName === 'A' ? 'link' : el.tagName === 'BUTTON' ? 'button' : el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.type === 'submit' || el.type === 'button' ? 'button' : 'field')
    const label = (text(el) || el.getAttribute('aria-label') || el.value || el.placeholder || el.title || el.name || '').slice(0, 120)
    elements.push({ id, role, label, type: el.type || '', secret: el.type === 'password' })
    if (elements.length >= 300) break
  }
  return { url: location.href, title: document.title, text: ((document.body && document.body.innerText) || '').slice(0, 30000), elements }
})()`

/** Click an element tagged by PAGE_READ_SCRIPT. */
export const CLICK_SCRIPT = (id: string) => `(() => {
  const el = document.querySelector('[data-marianne-el="${id}"]')
  if (!el) return false
  el.scrollIntoView({ block: 'center' })
  el.click()
  return true
})()`

/** Type into a field tagged by PAGE_READ_SCRIPT (never a password field). */
export const TYPE_SCRIPT = (id: string, value: string) => `(() => {
  const el = document.querySelector('[data-marianne-el="${id}"]')
  if (!el || el.type === 'password' || el.type === 'file') return false
  el.focus()
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
})()`

/** The label of a tagged element, to tell whether a click commits to something. */
export const LABEL_SCRIPT = (id: string) => `(() => {
  const el = document.querySelector('[data-marianne-el="${id}"]')
  return el ? ((el.innerText || el.value || el.getAttribute('aria-label') || el.title || '') + '').replace(/\\s+/g, ' ').trim().slice(0, 120) : ''
})()`
