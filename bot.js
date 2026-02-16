// bot.js - unified WhatsApp bot server (Express)
// npm i express axios
import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

// Your Apps Script Web App base URL, used for logging + human takeover checks
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL; // e.g. https://script.google.com/macros/s/XXXX/exec

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  // 1) Log inbound to Sheets control plane
  try {
    await axios.post(`${CONTROL_PLANE_URL}`, req.body, { params: { path: "webhook" } });
  } catch {}

  // 2) Parse inbound
  const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return;

  const from = msg.from;
  const text = msg.type === "text" ? (msg.text?.body || "") : "";

  // 3) Very simple deterministic routing (extend later)
  const reply =
`Salam! Options:
1) Browse products (send: products)
2) Order status (send: status <order_id>)
3) Talk to human (send: human)
`;

  if (text.toLowerCase().startsWith("human")) {
    await sendText(from, "Noted. A human will take over shortly.");
    return;
  }

  if (text.toLowerCase().startsWith("products")) {
    // Pull feed from Apps Script
    const feed = await axios.get(`${CONTROL_PLANE_URL}`, { params: { path: "api/products" }});
    const items = feed.data?.items?.slice(0, 10) || [];
    const lines = items.map(p => `- ${p.brand} ${p.model} (${p.category}): PKR ${p.retail}`).join("\n");
    await sendText(from, `Top products:\n${lines}\n\nReply with: buy <product_id>`);
    return;
  }

  await sendText(from, reply);
});

async function sendText(to, body) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  await axios.post(url, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  }, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
  });
}

app.listen(process.env.PORT || 3000, () => console.log("Bot running"));
