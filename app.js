import './env.js';
import express from 'express';
import crypto from 'crypto';

const verifySignature = (body, signature) => { const generatedSignature = crypto
    .createHmac("SHA256", process.env.LINE_CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return signature === generatedSignature;
}

const xDevice = '{"platform":"web","os":"macOS 10.15.7","device":"Chrome 143.0.0.0","name":"","version":6430,"id":"694295f1bf08cd5b429506e8","channel":"website","campaign":"","websocket":""}';

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
    const { token, cookie } = await ticktickAuth(username, password);

    await addTaskToTickTick(title, token, cookie);

    const lineAccessToken = await getLineAccessToken();

    await sendMessage(`💪 任務已登記完成: ${title}`, lineAccessToken);
  } catch (error) {
    const lineAccessToken = await getLineAccessToken();

    await sendMessage(`Failed to add todo: ${title}`, lineAccessToken);
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});

const getLineAccessToken = async () => {
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

const sendMessage = async (text, accessToken) => {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
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
          text,
        },
      ],
    }),
  })
  if (!response.ok) {
    throw new Error('Failed to send message');
  }
}

const ticktickAuth = async (username, password) => {
  const response = await fetch('https://api.ticktick.com/api/v2/user/signon?wc=true&remember=true', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device': xDevice,
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error('Failed to authenticate with TickTick');
  }

  const data = await response.json();
  const token = data.token;
  const cookie = response.headers.get('set-cookie');

  return { token, cookie };
}

const addTaskToTickTick = async (title, token, cookie) => {
  const response = await fetch('https://api.ticktick.com/api/v2/batch/task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-device': xDevice,
      'Cookie': cookie,
    },
    body: JSON.stringify({
      add: [{
        ...payload,
        title,
      }]
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to add task to TickTick');
  }
}
