import './env.js';
import express from 'express';
import crypto from 'crypto';

const verifySignature = (body, signature) => { const generatedSignature = crypto
    .createHmac("SHA256", process.env.LINE_CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return signature === generatedSignature;
}

const app = express();
const port = 8080;

app.use(express.json());

const payload = {
  items:[],
  reminders:[],
  exDate:[],
  dueDate:null,
  priority:0,
  progress:0,
  assignee:null,
  sortOrder:-10445368524800,
  startDate:null,
  isFloating:false,
  status:0,
  projectId: process.env.TICKTICK_PROJECT_ID,
  kind:null,
  tags:[],
  timeZone:"Asia/Seoul",
  content:"",
};

const prefix = 'todo:';

app.post('/', async (req) => {
  const body = JSON.stringify(req.body);
  if (!verifySignature(body, req.headers['x-line-signature'])) {
    console.log('Invalid signature');
    return;
  }

  const { events } = req.body;
  const messageEvent = events.find(event => event.type === 'message' && event.message.type === 'text');

  if (messageEvent == null) {
    console.log('No message event found');
    return;
  }

  const { text } = messageEvent.message;

  if (!text.toLowerCase().startsWith(prefix)) {
    return;
  }


  const title = text.slice(prefix.length).trim();

  const username = process.env.TICKTICK_USERNAME;
  const password = process.env.TICKTICK_PASSWORD;

  try {
    const response = await fetch('https://api.ticktick.com/api/v2/user/signon?wc=true&remember=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device': '{"platform":"web","os":"macOS 10.15.7","device":"Chrome 143.0.0.0","name":"","version":6430,"id":"694295f1bf08cd5b429506e8","channel":"website","campaign":"","websocket":""}',
      },
      body: JSON.stringify({ username, password }),
    });

    const { token } = await response.json();

    const cookie = response.headers.get('set-cookie');

    await fetch('https://api.ticktick.com/api/v2/batch/task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-device': '{"platform":"web","os":"macOS 10.15.7","device":"Chrome 143.0.0.0","name":"","version":6430,"id":"694295f1bf08cd5b429506e8","channel":"website","campaign":"","websocket":""}',
        'Cookie': cookie,
      },
      body: JSON.stringify({
        add: [{
          ...payload,
          title,
        }]
      }),
    });

    const accessToken = await getAccessToken();

    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replyToken: messageEvent.replyToken,
        messages: [
          {
            type: 'text',
            text: `💪 任務已登記完成: ${title}`,
          },
        ],
      }),
    })
  } catch (error) {
    const accessToken = await getAccessToken();

    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replyToken: messageEvent.replyToken,
        messages: [
          {
            type: 'text',
            text: `Failed to add todo: ${title}`,
          },
        ],
      }),
    })
  }

});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});

const getAccessToken = async () => {
  const response = await fetch('https://api.line.me/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.LINE_CHANNEL_ID,
      client_secret: process.env.LINE_CHANNEL_SECRET,
    }),
  });
  if (!response.ok) {
    throw new Error('Failed to get access token');
  }

  const accessToken = (await response.json()).access_token;
  return accessToken;
}
