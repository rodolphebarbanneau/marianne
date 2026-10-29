/**
 * @marianne/profile: the user's personal file, and the privacy boundary around it. Its model and
 * labels (profile), the domains of the app (domains), the [[tokens]] that stand for identifiers
 * in everything the engines see (tokens), the deadlines computed from it (rules) and the context
 * view the engines read (context).
 *
 * Pure: no Node, no Electron, no React, so the main process and the window share it. Where the
 * profile is kept (the archive) and how documents are read stay in the app. See docs/design.md.
 */

export * from './context'
export * from './domains'
export * from './profile'
export * from './rules'
export * from './tokens'
