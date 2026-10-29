import { proposeWithAi } from "./ai.ts";
import { proposeHeuristic } from "./heuristic.ts";
import type { GitDiff, ProposedPr, ProposeOptions } from "./types.ts";

export async function proposePr(
  diff: GitDiff,
  options: ProposeOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProposedPr> {
  const heuristic = proposeHeuristic({
    diff,
    type: options.type,
    scope: options.scope,
    vibe: options.vibe,
  });

  if (options.preferAi === false) return heuristic;
  const hasKey = Boolean(
    env.OPENAI_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim(),
  );
  if (!hasKey) return heuristic;

  const ai = await proposeWithAi(
    {
      diff,
      vibe: options.vibe,
      type: options.type,
      scope: options.scope,
    },
    env,
  );
  return ai ?? heuristic;
}
