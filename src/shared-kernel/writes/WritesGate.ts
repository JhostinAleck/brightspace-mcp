export interface WritesGateInput {
  configEnabled: boolean;
  cliFlag: boolean;
  configDryRun?: boolean;
}

export class WritesGate {
  readonly allowsWrites: boolean;
  readonly isDryRun: boolean;

  constructor(input: WritesGateInput) {
    this.allowsWrites = input.configEnabled && input.cliFlag;
    this.isDryRun = input.configDryRun ?? false;
  }
}
