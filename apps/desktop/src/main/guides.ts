import type { Tool } from './tools/tool'

/**
 * A service's guides come with Marianne's first use of the service in a folder: the first call of
 * one of its tools, or the opening of a site it declares. Asked to read a guide before a kind of
 * request, an engine may still go on without it (it did, live, on a toll operator's site): the
 * guide then comes with the result of what it called, once per folder, unless it read it itself.
 */

export interface Guide {
  name: string
  body: string
}

export interface GuideSources {
  /** The services that ship guides, with them (a community service's only once validated). */
  guides(): Array<{ service: string; guides: Guide[] }>
  /** Whether the page is on a site the service declares (built-in services only). */
  onSites(service: string, url: string): boolean
}

export class GuideLedger {
  /** Per folder, the guides it had: read with the skill tool, or given with a call. */
  private had = new Map<string, Set<string>>()

  constructor(private readonly sources: GuideSources) {}

  /** The skill tool read it in the folder: it won't come again. */
  noteRead(folderId: string, name: string): void {
    this.of(folderId).add(name)
  }

  /**
   * The guides of the service a call uses that its folder hasn't had yet, now counted as had: the
   * service's own tool, or open_site to one of its sites.
   */
  forCall(folderId: string, t: Pick<Tool, 'name' | 'service'>, args: unknown): Guide[] {
    const url = t.name === 'open_site' && args && typeof args === 'object' ? (args as { url?: unknown }).url : undefined
    const all = this.sources.guides()
    const used = t.service ? all.filter((s) => s.service === t.service) : typeof url === 'string' ? all.filter((s) => this.sources.onSites(s.service, url)) : []
    const had = this.of(folderId)
    const fresh = used.flatMap((s) => s.guides).filter((g) => !had.has(g.name))
    for (const g of fresh) had.add(g.name)
    return fresh
  }

  /** What goes after the call's result. */
  static text(guides: Guide[]): string {
    return guides
      .map((g) => `\n\n---\n\nThe guide « ${g.name} », which comes with this service's first use in the folder: follow it from here.\n\n${g.body}`)
      .join('')
  }

  private of(folderId: string): Set<string> {
    let set = this.had.get(folderId)
    if (!set) this.had.set(folderId, (set = new Set()))
    return set
  }
}
