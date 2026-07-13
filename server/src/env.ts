function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get JWT_ACCESS_SECRET() {
    return required("JWT_ACCESS_SECRET");
  },
  get JWT_REFRESH_SECRET() {
    return required("JWT_REFRESH_SECRET");
  },
};
