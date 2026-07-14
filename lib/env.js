function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

module.exports = {
  ML_CLIENT_ID: requireEnv("ML_CLIENT_ID"),
  ML_CLIENT_SECRET: requireEnv("ML_CLIENT_SECRET"),
  ML_REDIRECT_URI: requireEnv("ML_REDIRECT_URI"),
  FIREBASE_PROJECT_ID: requireEnv("FIREBASE_PROJECT_ID"),
  FIREBASE_CLIENT_EMAIL: requireEnv("FIREBASE_CLIENT_EMAIL"),
  FIREBASE_PRIVATE_KEY: requireEnv("FIREBASE_PRIVATE_KEY")
};
