const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai"); // 引入 AI 套件
const app = express();
app.use(require('cors')());

// 初始化 AI，它會自動去讀取你在 Zeabur 設定的 GEMINI_KEY
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

app.get('/api/restaurants', async (req, res) => {
    const { lat, lng, radius = 3000, keyword } = req.query;
    const GOOGLE_KEY = process.env.GOOGLE_KEY;

    try {
        // 步驟 A: 先去 Google Maps 抓附近 3 公里的所有餐廳
        const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=restaurant&key=${GOOGLE_KEY}&language=zh-TW`;
        const googleRes = await axios.get(googleUrl);
        let results = googleRes.data.results;

        // 步驟 B: 如果使用者有選種類 (如: 西式)，就請 AI 來過濾
        if (keyword && keyword !== "undefined" && results.length > 0) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            // 整理一份簡單的清單給 AI 看
            const listForAI = results.map(r => ({ name: r.name, id: r.place_id }));
            
            // 下指令給 AI (這就是 Prompt 工程)
            const prompt = `你是一個美食評論家。請從這份清單中挑選出真正符合「${keyword}」的餐廳。
            清單：${JSON.stringify(listForAI)}
            規則：
            1. 嚴格過濾。如果你覺得它不是「${keyword}」，就把它剔除。
            2. 僅回傳符合的 place_id 陣列，例如: ["id1", "id2"]。
            3. 不要回答多餘的解釋。`;

            const aiResult = await model.generateContent(prompt);
            const aiText = aiResult.response.text();
            
            try {
                // 把 AI 給的文字轉回程式看得懂的陣列
                const validIds = JSON.parse(aiText.match(/\[.*\]/s)[0]);
                results = results.filter(r => validIds.includes(r.place_id));
            } catch (e) {
                console.log("AI 回傳格式有誤，直接回傳原始名單");
            }
        }

        // 回傳結果給前端
        res.json({ status: "OK", results });
    } catch (error) {
        res.status(500).json({ status: "ERROR", message: "後端運作錯誤" });
    }
});

app.listen(8080, '0.0.0.0');