/**
 * @marianne/archive: the user's data at rest. One account is one encrypted file, `<id>.marianne`
 * (archive), found in the folder the user chose (accounts), unlocked by the master password, the
 * recovery key or a PIN on this computer (pin), and held open by a session until it locks
 * (session). The ciphers and key derivation (crypto) stay inside the package.
 *
 * Plain Node, no Electron: the app injects what only it has (the OS keystore). See docs/design.md.
 */

export * from './accounts'
export * from './archive'
export * from './pin'
export * from './session'
