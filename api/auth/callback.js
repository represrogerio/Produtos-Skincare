const fetch = require("node-fetch");
const { db, admin } = require("../../lib/firebase-admin");
const env = require("../../lib/env");

module.exports = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Código não recebido");

  try {
    const r = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: env.ML_CLIENT_ID,
        client_secret: env.ML_CLIENT_SECRET,
        code,
        redirect_uri: env.ML_REDIRECT_URI
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(400).json(data);

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await db.collection("ml_tokens").doc(String(data.user_id)).set({
      user_id: String(data.user_id),
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt.toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.send(`<html><body style="font-family:Arial;padding:40px;text-align:center">
      <h1>✅ Mercado Livre conectado!</h1>
      <p>User ID: ${data.user_id}</p>
      <p><a href="/">Voltar ao sistema</a></p>
    </body></html>`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erro: " + e.message);
  }
};
