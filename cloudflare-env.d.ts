declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ASSETS?: Fetcher;
    TAP2SERVE_STORAGE?: 'legacy' | 'normalized';
    TAP2SERVE_PRODUCTION?: string;
    TAP2SERVE_MAINTENANCE?: string;
    PUBLIC_READ_LIMITER?: RateLimit;
    GUEST_WRITE_LIMITER?: RateLimit;
    OPS_ALERT_WEBHOOK_URL?: string;
    OPS_ALERT_TOKEN?: string;
    TAP2SERVE_AUTH?: 'sites' | 'independent';
    AUTH_RATE_LIMIT_SECRET?: string;
    AUTH_MFA_KEY?: string;
    AUTH_MAIL_API_KEY?: string;
    AUTH_MAIL_FROM?: string;
    AUTH_ALLOW_LOCAL_HTTP?: string;
    TAP2SERVE_BASE_DOMAINS?: string;
    TAP2SERVE_LOCAL_DEV?: string;
    TAP2SERVE_LEGACY_GUEST_HOSTS?: string;
    TAP2SERVE_ACCESS_ISSUER?: string;
    TAP2SERVE_ACCESS_AUDIENCE?: string;
    BUCKET?: R2Bucket;
  }
}
