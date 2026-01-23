const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// 允許跨域請求
app.use(cors());

// 初始化 Gemini (從變數讀取 Key)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "NO_KEY");

app.get('/api/restaurants', async (req, res) => {
    // 1. 接收前端參數 (預設半徑改為 800m，適合步行)
    const { lat, lng, radius = 800, keyword } = req.query;
    const GOOGLE_KEY = process.env.GOOGLE_KEY;
    const GEMINI_KEY = process.env.GEMINI_KEY;

    console.log(`🔍 新的請求: 位置(${lat}, ${lng}), 範圍:${radius}m, 關鍵字:${keyword}`);

    if (!GOOGLE_KEY) {
        return res.status(500).json({ status: "ERROR", message: "後端缺少 GOOGLE_KEY" });
    }

    try {
        // --- 階段一：Google Maps 搜尋 ---
        // 這裡我們用 'rankby=distance' 有時候會更好，但 'radius' 比較好控制範圍
        const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=restaurant&key=${GOOGLE_KEY}&language=zh-TW`;
        
        const googleRes = await axios.get(googleUrl);
        let results = googleRes.data.results || [];
        
        console.log(`📡 Google 原始回傳：找到 ${results.length} 筆資料`);

        if (results.length === 0) {
            return res.json({ status: "ZERO_RESULTS", results: [] });
        }

        // --- 階段二：Gemini AI 嚴格篩選 ---
        // 只有當「有關鍵字」且「變數裡有設定 GEMINI_KEY」時才執行
        if (keyword && keyword !== "undefined" && GEMINI_KEY) {
            console.log("🤖 正在呼叫 Gemini 進行篩選...");
            
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                
                // 簡化資料給 AI，包含地址以利判斷
                const listForAI = results.map(r => ({ 
                    name: r.name, 
                    id: r.place_id,
                    vicinity: r.vicinity // 這是地址/地標
                }));
                
                const prompt = `
                任務：你是嚴格的美食過濾器。使用者想找「${keyword}」的餐廳。
                原始清單：${JSON.stringify(listForAI)}
                
                ❌ 嚴格剔除規則 (這很重要)：
                1. 找「甜點/下午茶」：絕對剔除「正餐、火鍋、熱炒、牛肉麵、便當」。即使它有賣甜湯，只要主業是鹹食就剔除。
                2. 找「西式」：絕對剔除「泰式、越式、日式、中式、台式、韓式」。
                3. 找「健康/輕食」：絕對剔除「高熱量便當、炸物、自助餐」。
                
                ✅ 保留規則：
                - 只有當店家「主打」${keyword} 時才保留。
                
                回傳格式：
                僅回傳一個 JSON 陣列，包含符合的 place_id。範例：["id1", "id2"]。
                不要 markdown，不要解釋。
                `;

                const aiResult = await model.generateContent(prompt);
                const aiText = aiResult.response.text();
                
                // 清理 AI 回傳的字串 (去掉 ```json 等符號)
                const cleanText = aiText.replace(/```json|```/g, '').trim();
                const validIds = JSON.parse(cleanText);
                
                console.log(`🧠 AI 判斷結果：保留了 ${validIds.length} 筆`);
                
                // 執行過濾
                const originalCount = results.length;
                results = results.filter(r => validIds.includes(r.place_id));
                
                // 如果 AI 篩到最後變 0 筆，為了避免畫面空白，我們回傳前 3 筆原始資料，並標記警告
                if (results.length === 0 && originalCount > 0) {
                    console.log("⚠️ AI 把名單全刪光了，啟動備案機制");
                    // 這裡你可以決定要不要回傳空的，或者回傳備用。目前先回傳空的。
                }

            } catch (aiError) {
                console.error("❌ Gemini 連線或解析失敗:", aiError.message);
                console.error("詳細錯誤:", aiError);
                // 失敗時，我們保持 results 不變，這樣至少使用者看得到東西
            }
        } else {
            console.log("⏭️ 跳過 AI 篩選 (原因：無關鍵字 或 無 GEMINI_KEY)");
        }

        res.json({ status: "OK", results });

    } catch (error) {
        console.error("🔥 伺服器重大錯誤:", error.message);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server starting on port ${PORT}`);
});