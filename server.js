const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors()); // 允許你的 GitHub Pages 跨網域存取

app.get('/api/restaurants', async (req, res) => {
    const { lat, lng } = req.query;
    const API_KEY = process.env.GOOGLE_KEY; // 金鑰會存在 Zeabur 的環境變數

    try {
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=500&type=restaurant&key=${API_KEY}&language=zh-TW`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: '連線 Google 失敗' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`伺服器跑在埠號 ${PORT}`));