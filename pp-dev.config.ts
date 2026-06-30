import { PPDevConfig } from '@metricinsights/pp-dev';

const config: PPDevConfig = {
  /**
   * Backend base URL — the MI instance this app talks to and is deployed on.
   */
  backendBaseURL: 'https://beta7.metricinsights.com',
  /**
   * App ID (Portal Page ID) that hosts this template.
   * Optional: only needed to load this App's editable variables (e.g. "App Title")
   * during local dev. Set it once the hosting App exists on beta7.
   */
  // appId: 1,
  /**
   * MI top bar. When false, the MI navigation/HUD is loaded from the backend
   * during local dev (matches how the app renders inside MI).
   */
  miHudLess: false,
  v7Features: true,
};

export default config;
