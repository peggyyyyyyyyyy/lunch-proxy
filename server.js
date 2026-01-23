const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// 1. 解決 CORS：允許所有來源連線
app.use(cors());

// 初始化 Gemini AI (從環境變數讀取 Key)
// 注意：如果沒設定 Key，這裡會報錯，但我們在下面有 try-catch 保護
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "NO_KEY");

// 2. 測試端點：用來確認伺服器活著
app.get('/', (req, res) => {
    res.send('Backend is running! (後端運作中)');
});

app.get('/api/restaurants', async (req, res) => {
    const { lat, lng, radius = 3000, keyword } = req.query;
    const GOOGLE_KEY = process.env.GOOGLE_KEY;

    // 檢查 Google Key 是否存在
    if (!GOOGLE_KEY) {
        return res.status(500).json({ status: "ERROR", message: "後端缺少 GOOGLE_KEY" });
    }

    try {
        console.log(`正在搜尋：${lat}, ${lng}, 關鍵字: ${keyword}`);

        // A. 呼叫 Google Places API
        const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=restaurant&key=${GOOGLE_KEY}&language=zh-TW`;
        const googleRes = await axios.get(googleUrl);
        let results = googleRes.data.results || [];

        // B. 如果有關鍵字且有結果，啟動 Gemini AI 篩選
        if (keyword && keyword !== "undefined" && results.length > 0 && process.env.GEMINI_KEY) {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const listForAI = results.map(r => ({ name: r.name, id: r.place_id }));
                
                const prompt = `你是一個嚴格的美食家。請從這份清單中篩選出真正符合「${keyword}」的餐廳。
                原始清單：${JSON.stringify(listForAI)}
                規則：
                1. 若選「西式」，排除泰式、中式、日式、麵攤。
                2. 若選「健康」，排除炸物、速食。
                3. 嚴格剔除不相關的。
                4. 只回傳符合的 place_id 陣列，例如: ["id1", "id2"]。不要解釋。`;

                const aiResult = await model.generateContent(prompt);
                const aiText = aiResult.response.text();
                
                // 解析 AI 回傳的 JSON
                const validIds = JSON.parse(aiText.match(/\[.*\]/s)[0]);
                results = results.filter(r => validIds.includes(r.place_id));
                console.log(`AI 篩選完成，剩餘 ${results.length} 筆`);
            } catch (aiError) {
                console.error("AI 篩選失敗 (使用原始名單):", aiError.message);
            }
        }

        res.json({ status: "OK", results });

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

// 3. 啟動伺服器 (Zeabur 必備設定)
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server starting on port ${PORT}`);
});