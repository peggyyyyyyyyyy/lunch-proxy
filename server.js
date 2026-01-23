const express = require('express');
const axios = require('axios');
const cors = require('cors'); // 引入跨域處理套件
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// --- 重要：修正 CORS 錯誤 ---
// 允許來自 GitHub Pages 的前端連線
app.use(cors({
  origin: '*', // 測試階段先允許所有來源，若要安全可改為你的 GitHub Pages 網址
  methods: ['GET', 'POST']
}));

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

app.get('/api/restaurants', async (req, res) => {
    const { lat, lng, radius = 3000, keyword } = req.query;
    const GOOGLE_KEY = process.env.GOOGLE_KEY;

    // 檢查 Key 是否存在
    if (!GOOGLE_KEY) {
        return res.status(500).json({ status: "ERROR", message: "後端缺少 Google API Key" });
    }

    try {
        // 1. 向 Google 請求原始資料
        const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=restaurant&key=${GOOGLE_KEY}&language=zh-TW`;
        const googleRes = await axios.get(googleUrl);
        let results = googleRes.data.results;

        // 2. 若有關鍵字，啟動 Gemini AI 篩選
        if (keyword && keyword !== "undefined" && results.length > 0) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const listForAI = results.map(r => ({ name: r.name, id: r.place_id }));
            
            const prompt = `你是一個專業的美食導遊。請從這份清單中篩選出真正符合「${keyword}」類型的餐廳。
            清單：${JSON.stringify(listForAI)}
            規則：
            1. 嚴格過濾。如果是「西式」就必須排除泰式、中式、日式等。
            2. 只回傳符合條件的 ID 陣列，例如：["id1", "id2"]。
            3. 不要回答任何廢話。`;

            const aiResult = await model.generateContent(prompt);
            const aiText = aiResult.response.text();
            
            try {
                const validIds = JSON.parse(aiText.match(/\[.*\]/s)[0]);
                results = results.filter(r => validIds.includes(r.place_id));
            } catch (e) {
                console.log("AI 解析失敗，使用原始清單");
            }
        }

        res.json({ status: "OK", results });
    } catch (error) {
        console.error("Server Error:", error.message);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

// --- 重要：Zeabur 必須監聽指定的 Port ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 後端伺服器已在埠號 ${PORT} 啟動`);
});