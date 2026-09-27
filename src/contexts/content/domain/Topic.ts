export type TopicKind = 'file' | 'link' | 'quiz' | 'lti' | 'dropbox' | 'discussion' | 'other';

export interface TopicProps {
  id: number;
  title: string;
  kind: TopicKind;
  url: string | null;
  fileExtension: string | null;
  /** D2L flags topics whose target was deleted/unlinked (Url is then usually null). */
  isBroken?: boolean;
}

export class Topic {
  constructor(private readonly props: TopicProps) {}
  get id(): number { return this.props.id; }
  get title(): string { return this.props.title; }
  get kind(): TopicKind { return this.props.kind; }
  get url(): string | null { return this.props.url; }
  get fileExtension(): string | null { return this.props.fileExtension; }
  get isBroken(): boolean { return this.props.isBroken ?? false; }
}
