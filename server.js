app.get('/api/restaurants', async (req, res) => {
    const { lat, lng, radius = 3000, keyword } = req.query;
    const GOOGLE_KEY = process.env.GOOGLE_KEY;
    const GEMINI_KEY = process.env.GEMINI_KEY;

    // 🔍 診斷 1: 檢查鑰匙是否存在
    if (!GOOGLE_KEY || !GEMINI_KEY) {
        console.error("❌ 錯誤：Zeabur 環境變數缺少金鑰！");
        return res.status(500).json({ status: "ERROR", message: "後端金鑰未設定" });
    }

    try {
        console.log(`📡 正在請求 Google Maps 資料... (Lat: ${lat}, Lng: ${lng})`);
        const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=restaurant&key=${GOOGLE_KEY}&language=zh-TW`;
        
        const googleRes = await axios.get(googleUrl);
        
        // 🔍 診斷 2: 檢查 Google 回傳結果
        if (googleRes.data.status !== "OK" && googleRes.data.status !== "ZERO_RESULTS") {
            console.error("❌ Google API 報錯:", googleRes.data.error_message || googleRes.data.status);
            return res.status(500).json({ status: "ERROR", message: "Google API 授權失敗" });
        }

        let results = googleRes.data.results;
        console.log(`✅ 成功抓取 ${results.length} 筆餐廳資料`);

        // ... (AI 篩選邏輯保持不變) ...

        res.json({ status: "OK", results });
    } catch (error) {
        console.error("❌ 系統連線崩潰:", error.message);
        res.status(500).json({ status: "ERROR", message: error.message });
    }
});