import type { Topic } from './Topic.js';

export interface ModuleProps {
  id: number;
  title: string;
  topics: Topic[];
  submodules: Module[];
  /**
   * Module description HTML. Some instructors put the actual course material
   * here (links to /content/enforced/... PDFs, embedded videos) instead of
   * creating topics, so it must not be dropped.
   */
  descriptionHtml?: string | null;
}

export class Module {
  constructor(private readonly props: ModuleProps) {}
  get id(): number { return this.props.id; }
  get title(): string { return this.props.title; }
  get topics(): readonly Topic[] { return this.props.topics; }
  get submodules(): readonly Module[] { return this.props.submodules; }
  get descriptionHtml(): string | null { return this.props.descriptionHtml ?? null; }
}
