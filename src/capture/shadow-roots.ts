const MAX_ROOTS = 512;
const MAX_SCAN_JOBS = 128;
const NODES_PER_TASK = 400;
interface ScanJob {
  root: Node;
  walker: TreeWalker;
  current: Node | null;
}

/** Discovers closed roots with Chrome's DOM API; never patches the page's attachShadow. */
export class ShadowRootDiscovery {
  private readonly roots = new Set<ShadowRoot>();
  private readonly queued = new WeakSet<Node>();
  private readonly jobs: ScanJob[] = [];
  private readonly delayedPaths = new Set<ReturnType<typeof setTimeout>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private scanning = false;
  private stopped = false;
  private readonly observer: MutationObserver;

  constructor(
    private readonly document: Document,
    private readonly onRoot: (root: ShadowRoot) => void,
  ) {
    this.observer = new MutationObserver((records) => {
      for (const record of records.slice(0, NODES_PER_TASK)) {
        // A host gaining light-DOM children may also just have gained a shadow root.
        this.inspect(record.target);
        for (const node of record.addedNodes) {
          if (this.jobs.length >= MAX_SCAN_JOBS) break;
          this.enqueue(node);
        }
      }
    });
    this.observer.observe(document, { childList: true, subtree: true });
    this.enqueue(document);
  }

  /** Interaction paths catch roots added to existing hosts without observable light-DOM mutation. */
  inspectEventPath(event: Event, afterInteraction = false): void {
    const path = event
      .composedPath()
      .slice(0, 32)
      .filter((node): node is Node => node instanceof Node);
    for (const node of path) this.inspect(node);
    if (afterInteraction && this.delayedPaths.size < 8) {
      const timer = setTimeout(() => {
        this.delayedPaths.delete(timer);
        if (!this.stopped) for (const node of path) this.inspect(node);
      }, 0);
      this.delayedPaths.add(timer);
    }
  }

  dispose(): void {
    this.stopped = true;
    this.observer.disconnect();
    if (this.timer !== undefined) clearTimeout(this.timer);
    for (const timer of this.delayedPaths) clearTimeout(timer);
    this.delayedPaths.clear();
    this.jobs.length = 0;
    this.roots.clear();
  }

  private inspect(node: Node): void {
    if (this.stopped || node.nodeType !== Node.ELEMENT_NODE || this.roots.size >= MAX_ROOTS) return;
    let root: ShadowRoot | null = null;
    try {
      root = chrome.dom.openOrClosedShadowRoot(node as HTMLElement);
    } catch {
      return;
    }
    if (!root || this.roots.has(root)) return;
    this.roots.add(root);
    this.onRoot(root);
    this.observer.observe(root, { childList: true, subtree: true });
    this.enqueue(root);
  }

  private enqueue(root: Node): void {
    if (this.stopped || this.queued.has(root) || this.jobs.length >= MAX_SCAN_JOBS) return;
    if (
      root.nodeType !== Node.ELEMENT_NODE &&
      root.nodeType !== Node.DOCUMENT_NODE &&
      root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    )
      return;
    this.queued.add(root);
    this.jobs.push({
      root,
      walker: this.document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT),
      current: root,
    });
    if (!this.scanning && this.timer === undefined) this.timer = setTimeout(() => this.scan(), 0);
  }

  private scan(): void {
    this.timer = undefined;
    this.scanning = true;
    let remaining = NODES_PER_TASK;
    while (!this.stopped && this.jobs.length && remaining-- > 0) {
      const job = this.jobs[0]!;
      if (job.current && job.root.isConnected) {
        this.inspect(job.current);
        job.current = job.walker.nextNode();
      } else {
        this.jobs.shift();
        this.queued.delete(job.root);
      }
    }
    this.scanning = false;
    if (!this.stopped && this.jobs.length) this.timer = setTimeout(() => this.scan(), 0);
  }
}
