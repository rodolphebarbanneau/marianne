import contributors from './contributors.json'

/** Where Marianne is made: its repository on GitHub. */
export const REPO_URL = 'https://github.com/rodolphebarbanneau/marianne'

/** The forms of a new issue (.github/ISSUE_TEMPLATE/<name>.yml), in English like all of GitHub's side. */
export type IssueForm = 'bug' | 'idea'

/** A new issue on one of the repository's forms, its version field already filled in. */
export const issueUrl = (form: IssueForm, version?: string): string =>
  `${REPO_URL}/issues/new?template=${form}.yml${version ? `&version=${encodeURIComponent(version)}` : ''}`

export type ProjectLinkId = 'source' | 'problem' | 'idea' | 'releases' | 'guide'

/** The pages of the repository the app links to, in the order the GUIDE shows them; the forms with this version in them. */
export const projectLinks = (version?: string): { id: ProjectLinkId; label: string; url: string }[] => [
  { id: 'source', label: 'code source', url: REPO_URL },
  { id: 'problem', label: 'signaler un problème', url: issueUrl('bug', version) },
  { id: 'idea', label: 'proposer une idée', url: issueUrl('idea', version) },
  { id: 'releases', label: 'versions et nouveautés', url: `${REPO_URL}/releases` },
  // The user guide in the app's language (docs/guide/<lang>/).
  { id: 'guide', label: 'guide d’utilisation', url: `${REPO_URL}/blob/main/docs/guide/fr/index.md` }
]

export interface Contributor {
  login: string
  name: string
  url: string
}

/** The authors: the repository's contributors on GitHub, its owner first (written by scripts/contributors.mjs). */
export const CONTRIBUTORS: Contributor[] = contributors
