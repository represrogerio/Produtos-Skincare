const env = require("../../lib/env");

module.exports = async (req, res) => {
  const url =
    `https://auth.mercadolivre.com.br/authorization` +
    `?response_type=code` +
    `&client_id=${env.ML_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(env.ML_REDIRECT_URI)}`;
  res.redirect(url);
};
