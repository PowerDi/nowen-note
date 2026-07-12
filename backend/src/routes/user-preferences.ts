import { Hono } from "hono";
import legacyRoutes from "./user-preferences-legacy";
import reliableAIRoutes from "./ai-reliable";
import mobileBootstrapRoutes from "./mobile-bootstrap";

/**
 * Compatibility wrapper: existing user preference/profile endpoints stay at their
 * original paths, while reliability/startup pipelines are isolated under explicit
 * sub-paths so older clients remain untouched.
 */
const app = new Hono();

// Must be mounted before `/`: the legacy router also owns the root preference route.
app.route("/mobile-bootstrap", mobileBootstrapRoutes);
app.route("/ai-reliable", reliableAIRoutes);
app.route("/", legacyRoutes);

export default app;
