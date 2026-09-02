import rateLimit from 'express-rate-limit';

/** API.md §Auth: 10 attempts / 15 min / IP, refused in the standard error envelope. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Too many sign-in attempts. Wait fifteen minutes and try again.'
      }
    });
  }
});
