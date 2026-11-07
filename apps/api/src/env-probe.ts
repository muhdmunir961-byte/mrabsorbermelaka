export {};

/**
 * Prints a one-line result for the environment guard tests, never a secret value.
 * `console.error` is used so the line survives a non-zero exit status.
 */
try {
  const { env } = await import('./env.js');
  console.error('ENV_OK nodeEnv=' + env.NODE_ENV + ' devCode=' + String(env.OTP_EXPOSE_DEV_CODE));
} catch (error) {
  const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
  console.error('ENV_REJECTED ' + message);
}
