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
                        
                        // 為了讓 AI 判斷更準，我們這次多給它地址，讓它判斷是不是夜市或奇怪的地方
                        const listForAI = results.map(r => ({ 
                            name: r.name, 
                            id: r.place_id,
                            address: r.vicinity || "" // 多給地址輔助判斷
                        }));
                        
                        // 🔥 這裡是關鍵修改：超級嚴格的提示詞 🔥
                        const prompt = `
                        你是一個極度嚴格的美食分類員。使用者想找「${keyword}」類型的店。
                        請審查以下 Google 搜尋結果：${JSON.stringify(listForAI)}
                        
                        🔴 嚴格剔除規則 (必須執行)：
                        1. 如果使用者找「甜點/下午茶/咖啡」：
                        - 絕對剔除「中式餐廳」、「熱炒」、「火鍋」、「麵店」、「正餐店」。
                        - 即使這家餐廳有賣甜湯或冰淇淋，只要它的本業是賣正餐，就剔除。
                        - 剔除名字看起來像傳統小吃的店（例如：XX小吃、XX麵館）。
                        
                        2. 如果使用者找「西式」：
                        - 剔除所有「泰式」、「越式」、「韓式」、「日式」、「台式」。
                        - 剔除只賣三明治的早餐店。
                        
                        3. 如果使用者找「健康/輕食」：
                        - 剔除所有「便當店」、「自助餐」、「速食炸物」。

                        🟢 通過規則：
                        - 只有當這家店的「主要屬性」完全符合「${keyword}」時才保留。
                        
                        請回傳一個 JSON 陣列，只包含符合條件的 place_id，格式範例：["id1", "id2"]。
                        不要輸出任何 markdown 標記或解釋文字，直接給 JSON。
                        `;

                        const aiResult = await model.generateContent(prompt);
                        const aiText = aiResult.response.text();
                        
                        // 清理 AI 可能回傳的 Markdown 格式 (```json ... ```)
                        const cleanText = aiText.replace(/```json|```/g, '').trim();
                        
                        const validIds = JSON.parse(cleanText);
                        
                        // 紀錄一下篩選前後的數量，方便去 Logs 檢查
                        console.log(`AI 篩選前：${results.length} 筆 -> AI 篩選後：${validIds.length} 筆`);
                        
                        results = results.filter(r => validIds.includes(r.place_id));

                    } catch (aiError) {
                        console.error("❌ AI 篩選出錯 (已退回原始名單):", aiError.message);
                        // 這裡不出錯回傳，而是讓它保留原始名單，避免程式崩潰
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