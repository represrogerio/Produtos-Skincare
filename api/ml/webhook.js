const fetch = require("node-fetch");
const { db, admin } = require("../../lib/firebase-admin");
const env = require("../../lib/env");

async function getValidToken(userId) {
  const ref = db.collection("ml_tokens").doc(String(userId));
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Token não encontrado: ${userId}`);
  const data = snap.data();
  if (new Date(data.expires_at) > new Date()) return data.access_token;

  const r = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: env.ML_CLIENT_ID,
      client_secret: env.ML_CLIENT_SECRET,
      refresh_token: data.refresh_token
    })
  });
  const nd = await r.json();
  if (!r.ok) throw new Error("Erro refresh: " + JSON.stringify(nd));

  const expiresAt = new Date(Date.now() + nd.expires_in * 1000);
  await ref.set({
    user_id: String(userId),
    access_token: nd.access_token,
    refresh_token: nd.refresh_token,
    expires_at: expiresAt.toISOString(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return nd.access_token;
}

module.exports = async (req, res) => {
  res.status(200).send("ok");

  try {
    const { topic, resource, user_id } = req.body || {};
    console.log("Webhook:", JSON.stringify(req.body));
    if (topic !== "orders_v2" || !resource || !user_id) return;

    const orderId = String(resource.split("/").pop());
    const procRef = db.collection("pedidos_processados").doc(orderId);
    if ((await procRef.get()).exists) return;

    const token = await getValidToken(user_id);
    const orderResp = await fetch(`https://api.mercadolibre.com${resource}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const order = await orderResp.json();
    if (!orderResp.ok) { console.error(order); return; }

    const pago = (order.payments || []).some(p => p.status === "approved");
    if (!pago) { console.log("Não pago"); return; }

    for (const item of order.order_items || []) {
      const mlItemId = item?.item?.id;
      const qtd = Number(item?.quantity || 0);
      if (!mlItemId || !qtd) continue;

      const q = await db.collection("produtos")
        .where("ml_item_id", "==", mlItemId).limit(1).get();
      if (q.empty) { console.log("Sem produto:", mlItemId); continue; }

      const d = q.docs[0];
      const p = d.data();
      const antes = Number(p.estoque || 0);
      const depois = Math.max(0, antes - qtd);

      await d.ref.update({
        estoque: depois,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        last_ml_order_id: orderId
      });

      await db.collection("compras").add({
        produtoId: d.id,
        produtoNome: p.nome || "",
        foto: p.foto || "",
        tipo: "Venda ML",
        qtd: qtd,
        totalUSD: 0,
        totalBRL: (item.unit_price || 0) * qtd,
        ml_order_id: orderId,
        data: new Date().toISOString()
      });

      console.log(`✅ ${p.nome}: ${antes} → ${depois}`);
    }

    await procRef.set({
      order_id: orderId,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error("Erro webhook:", e);
  }
};
