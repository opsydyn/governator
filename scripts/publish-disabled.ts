console.error(
  "Publication unavailable: local candidate eligibility cannot authorize npm publication. Configure a trusted publishing adapter in a separately approved release workflow.",
);
process.exitCode = 2;
