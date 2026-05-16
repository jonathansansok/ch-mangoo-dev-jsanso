export interface SeedArgs {
  reset: boolean;
  only: string | null;
}

export function parseArgs(argv: string[]): SeedArgs {
  const args: SeedArgs = { reset: false, only: null };
  for (const arg of argv) {
    if (arg === '--reset') args.reset = true;
    else if (arg.startsWith('--only=')) args.only = arg.slice('--only='.length);
  }
  return args;
}
