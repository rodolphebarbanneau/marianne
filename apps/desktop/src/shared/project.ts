import contributors from './contributors.json'

/** Where Marianne is made: its repository on GitHub. */
export const REPO_URL = 'https://github.com/rodolphebarbanneau/marianne'

/** The forms of a new issue (.github/ISSUE_TEMPLATE/<name>.yml). */
export type IssueForm = 'probleme' | 'idee'

/** A new issue on one of the repository's forms, its version field already filled in. */
export const issueUrl = (form: IssueForm, version?: string): string =>
  `${REPO_URL}/issues/new?template=${form}.yml${version ? `&version=${encodeURIComponent(version)}` : ''}`

export type ProjectLinkId = 'source' | 'problem' | 'idea' | 'releases' | 'testers'

/** The pages of the repository the app links to, in the order the GUIDE shows them; the forms with this version in them. */
export const projectLinks = (version?: string): { id: ProjectLinkId; label: string; url: string }[] => [
  { id: 'source', label: 'code source', url: REPO_URL },
  { id: 'problem', label: 'signaler un problème', url: issueUrl('probleme', version) },
  { id: 'idea', label: 'proposer une idée', url: issueUrl('idee', version) },
  { id: 'releases', label: 'versions et nouveautés', url: `${REPO_URL}/releases` },
  { id: 'testers', label: 'guide des testeurs', url: `${REPO_URL}/blob/main/docs/alpha.md` }
]

export interface Contributor {
  login: string
  name: string
  url: string
}

/** The authors: the repository's contributors on GitHub, its owner first (written by scripts/contributors.mjs). */
export const CONTRIBUTORS: Contributor[] = contributors
