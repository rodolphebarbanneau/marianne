import { describe, expect, it, vi } from 'vitest'
import { chatgptAccount } from '../src/main/engines/codex'

vi.mock('../src/main/mcp', () => ({ MCP_SERVER_NAME: 'marianne', mcp: { token: 'secret', urlFor: (f: string) => `http://127.0.0.1:1234/mcp?f=${f}` } }))

/** An identity token as Codex keeps it in auth.json: only its middle part, the claims, matters here (invented ones). */
const token = (claims: Record<string, unknown>) => ['header', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'signature'].join('.')
const auth = (claims: Record<string, unknown>) => JSON.stringify({ auth_mode: 'chatgpt', tokens: { id_token: token(claims), access_token: 'invented' } })

describe('the ChatGPT account Codex signed in with', () => {
  it('says its email and its plan, as Claude Code says its own', () => {
    const claims = { email: 'camille.martin@exemple.fr', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } }
    expect(chatgptAccount(auth(claims))).toBe('camille.martin@exemple.fr · plus')
  })

  it('says what it has when the plan or the email is missing', () => {
    expect(chatgptAccount(auth({ email: 'camille.martin@exemple.fr' }))).toBe('camille.martin@exemple.fr')
    expect(chatgptAccount(auth({ 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } }))).toBe('pro')
  })

  it('says nothing of a file it cannot read: no token, a broken token, not JSON', () => {
    expect(chatgptAccount(JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'invented' }))).toBeUndefined()
    expect(chatgptAccount(JSON.stringify({ tokens: { id_token: 'not-a-token' } }))).toBeUndefined()
    expect(chatgptAccount(auth({}))).toBeUndefined()
    expect(chatgptAccount('{')).toBeUndefined()
  })
})
