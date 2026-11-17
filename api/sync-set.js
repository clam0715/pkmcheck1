const axios = require('axios');
const cheerio = require('cheerio');

async function searchSnkrdunk(keyword) {
    try {
        const url = `https://snkrdunk.com/search?keywords=${encodeURIComponent(keyword)}&slide=right`;
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
            },
            timeout: 8000
        });

        const $ = cheerio.load(html);
        const nextDataRaw = $('#__NEXT_DATA__').html();
        if (!nextDataRaw) return [];

        const nextData = JSON.parse(nextDataRaw);
        const pageProps = nextData?.props?.pageProps || {};
        return pageProps?.searchResult?.items || pageProps?.items || [];
    } catch (err) {
        return [];
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { series } = req.body;
    if (!series) {
        return res.status(400).json({ error: '請提供系列名稱' });
    }

    try {
        const items = await searchSnkrdunk(series.trim());
        if (!items || items.length === 0) {
            return res.status(404).json({ error: `搵唔到系列 「${series}」 嘅卡牌` });
        }

        const cardsMap = {};
        for (let item of items) {
            const name = item.name || item.title || '';
            const price = item.minPrice || item.price || 0;
            const image = item.imageUrl || item.image || '';
            const productId = item.id || item.productId;
            const productUrl = `https://snkrdunk.com/products/${productId}`;

            const matchNumber = name.match(/([0-9]{3,4}\/[0-9]{2,3}|[0-9]{1,3}\/[0-9]{2,3})/);
            const cardNum = matchNumber ? matchNumber[0] : 'OTHER';

            if (!cardsMap[cardNum]) {
                cardsMap[cardNum] = {
                    series: series.toUpperCase(),
                    number: cardNum,
                    name: name.replace(/PSA10|PSA 10/gi, '').trim(),
                    image: image,
                    rawPrice: 0,
                    psa10Price: 0,
                    url: productUrl
                };
            }

            const upperName = name.toUpperCase();
            if (upperName.includes('PSA10') || upperName.includes('PSA 10')) {
                cardsMap[cardNum].psa10Price = price;
            } else {
                cardsMap[cardNum].rawPrice = price;
                cardsMap[cardNum].url = productUrl;
            }
        }

        const cardsList = Object.values(cardsMap);
        return res.status(200).json({ success: true, cards: cardsList });

    } catch (error) {
        return res.status(500).json({ error: `同步出錯: ${error.message}` });
    }
}