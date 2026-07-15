const fetch = require("node-fetch");
const { db, admin } = require("../../lib/firebase-admin");
const env = require("../../lib/env");

async function getValidToken() {
  const snap = await db.collection("ml_tokens").get();
  if (snap.empty) throw new Error("Nenhum token encontrado. Conecte o Mercado Livre primeiro.");
  
  const tokenDoc = snap.docs[0];
  const data = tokenDoc.data();
  
  if (new Date(data.expires_at) > new Date()) {
    return data.access_token;
  }

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
  await tokenDoc.ref.set({
    access_token: nd.access_token,
    refresh_token: nd.refresh_token,
    expires_at: expiresAt.toISOString(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  return nd.access_token;
}

module.exports = async (req, res) => {
  try {
    const token = await getValidToken();
    
    const snap = await db.collection("produtos").get();
    const resultados = [];
    let atualizados = 0;
    let erros = 0;

    for (const docSnap of snap.docs) {
      const p = docSnap.data();
      
      if (!p.ml_item_id) {
        resultados.push({ nome: p.nome || docSnap.id, status: "sem ml_item_id" });
        continue;
      }

      try {
        const r = await fetch(`https://api.mercadolibre.com/items/${p.ml_item_id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const item = await r.json();
        
        if (!r.ok) {
          resultados.push({ 
            nome: p.nome, 
            status: "erro API: " + (item.message || item.error || "desconhecido") 
          });
          erros++;
          continue;
        }

        const estoqueML = Number(item.available_quantity || 0);
        const estoqueAnterior = Number(p.estoque || 0);
        
        await docSnap.ref.update({
          estoque: estoqueML,
          ml_titulo: item.title || "",
          ml_preco: item.price || 0,
          ml_status: item.status || "",
          ml_permalink: item.permalink || "",
          ultimaSincronizacaoML: admin.firestore.FieldValue.serverTimestamp()
        });
        
        resultados.push({ 
          nome: p.nome, 
          estoque_anterior: estoqueAnterior,
          estoque_novo: estoqueML,
          status: "atualizado" 
        });
        atualizados++;
      } catch (e) {
        resultados.push({ nome: p.nome, status: "erro: " + e.message });
        erros++;
      }
    }

    return res.status(200).json({
      sucesso: true,
      total: snap.size,
      atualizados,
      erros,
      resultados
    });
  } catch (e) {
    console.error("Erro sync-estoque:", e);
    return res.status(500).json({ sucesso: false, erro: e.message });
  }
};
