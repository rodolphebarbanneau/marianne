import { fetchLatest, type Release } from './release'

// Once per build, shared by every page: the token (CI's GITHUB_TOKEN) only lifts the rate limit.
let cached: Promise<Release | null> | undefined
export const buildRelease = () => (cached ??= fetchLatest(process.env.GITHUB_TOKEN))
