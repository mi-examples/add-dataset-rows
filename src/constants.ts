export interface PPVariables {
  /**
   * Optional heading text. Configured as an editable App variable named
   * "App Title" in Metric Insights.
   */
  APP_TITLE?: string;
}

/**
 * Reads a Metric Insights template variable value.
 *
 * Unreplaced placeholders — e.g. the literal "[App Title]" left in place when
 * the App has no matching editable variable — are treated as unset.
 */
function readVar(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return undefined;
  }

  return trimmed;
}

const raw: Record<string, unknown> =
  typeof window !== 'undefined' && typeof window.PP_VARIABLES === 'object'
    ? (window.PP_VARIABLES as Record<string, unknown>)
    : {};

export const PP_VARIABLES: PPVariables = {
  APP_TITLE: readVar(raw.APP_TITLE),
};

export const APP_TITLE = PP_VARIABLES.APP_TITLE ?? 'Add Dataset Rows';
