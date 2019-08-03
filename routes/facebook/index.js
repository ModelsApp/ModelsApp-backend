const axios = require('axios');

const newDataFetcher = require('./tokenFetcher');

const FB_WEBHOOK_ROUTE = '/api/facebook/webhook/';

module.exports = (app) => {
  const fetchData = newDataFetcher(
    axios.create({
      baseURL: 'https://graph.facebook.com/',
    }),
    process.env.FB_PAGE_ACCESS_TOKEN,
  );

  app.get(FB_WEBHOOK_ROUTE, (req, res) => {
    if (req.query['hub.verify_token'] === process.env.FB_VERIFY_TOKEN){
      return res.send(req.query['hub.challenge']);
    }
    res.status(400).json({ message: 'wrong token' });
  });

  app.post(FB_WEBHOOK_ROUTE, async (req, res) => {
    let result;
    if (req.body.field !== 'mentions') {
      return res.send(400).json({ message: 'unsupported type' });
    }
    try {
      const { media_id } = req.body.value;
      const { data } = await fetchData(`/${media_id}`);
      result = data;
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    return res.status(200).send(result);
  });
};
