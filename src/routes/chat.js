const express = require('express');
const prisma = require('../db');
const { getSystemPrompt } = require('../chatbot/system-prompt');

const router = express.Router();

function getProvider() {
  if (process.env.GROQ_API_KEY) return {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: process.env.GROQ_API_KEY,
    model: 'llama-3.1-70b-versatile',
    name: 'groq',
  };
  if (process.env.GEMINI_API_KEY) return {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    key: process.env.GEMINI_API_KEY,
    model: 'gemini-2.0-flash',
    name: 'gemini',
  };
  if (process.env.DEEPSEEK_API_KEY) return {
    url: 'https://api.deepseek.com/v1/chat/completions',
    key: process.env.DEEPSEEK_API_KEY,
    model: 'deepseek-chat',
    name: 'deepseek',
  };
  return null;
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'ONLY call this after you have explicitly collected AND confirmed ALL 5 required fields from the user: parent_name, child_name, child_age, service, phone. Do NOT call this if any field is missing or was not directly provided by the user.',
      parameters: {
        type: 'object',
        properties: {
          parent_name:    { type: 'string', description: 'Full name of parent — MUST be explicitly provided by user' },
          child_name:     { type: 'string', description: 'Child name — MUST be explicitly provided by user' },
          child_age:      { type: 'string', description: 'Child age — MUST be explicitly provided by user' },
          service:        { type: 'string', description: 'Therapy service' },
          phone:          { type: 'string', description: 'Phone number — MUST be explicitly provided by user' },
          preferred_time: { type: 'string', description: 'Preferred days or times' },
          notes:          { type: 'string', description: 'Additional notes' },
          language:       { type: 'string', enum: ['ar', 'en'], description: 'Conversation language' },
        },
        required: ['parent_name', 'child_name', 'child_age', 'service', 'phone'],
      },
    },
  },
];

// Strip characters from wrong scripts (CJK, Vietnamese diacritics, etc.)
function cleanResponse(text) {
  return text
    .replace(/[一-鿿㐀-䶿豈-﫿]/g, '')  // CJK
    .replace(/[　-〿぀-ゟ゠-ヿ]/g, '')   // Japanese
    .replace(/[가-힯]/g, '')                               // Korean
    .replace(/[đĐơƠưƯăĂ]/g, '')                                   // Vietnamese
    .replace(/để|của|với|và|không|này|những/g, '')                  // Vietnamese words
    .replace(/我们|你好|的|了|在|是|有|这|那|什么|可以/g, '')           // Chinese words
    .replace(/，/g, '،')                                            // Chinese comma → Arabic comma
    .replace(/\s{2,}/g, ' ')                                       // collapse double spaces
    .trim();
}

function detectLanguage(messages) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
  const arabicChars = (lastUserMsg.match(/[؀-ۿ]/g) ?? []).length;
  const latinChars  = (lastUserMsg.match(/[a-zA-Z]/g) ?? []).length;
  if (arabicChars > 0 && latinChars === 0) return 'ar';
  if (latinChars > 0 && arabicChars === 0) return 'en';
  return 'mixed';
}

async function upsertSession({ sessionId, language, pageUrl, userAgent, isNew }) {
  if (!sessionId) return;
  try {
    if (isNew) {
      await prisma.chatbotSession.upsert({
        where: { sessionId },
        update: { lastSeen: new Date(), status: 'active' },
        create: { sessionId, language, pageUrl: pageUrl ?? '', userAgent: userAgent ?? '', status: 'active' },
      });
    } else {
      await prisma.chatbotSession.update({ where: { sessionId }, data: { lastSeen: new Date() } }).catch(() => {});
    }
  } catch (e) { console.error('[upsertSession]', e.message); }
}

async function saveMsg({ sessionId, role, content, language }) {
  if (!sessionId) return;
  try {
    await prisma.chatbotMessage.create({ data: { sessionId, role, content, language } });
  } catch (e) { console.error('[saveMsg]', e.message); }
}

async function saveAppointment(data, sessionId) {
  if (!data.parent_name || !data.child_name || !data.phone) {
    console.error('[saveAppointment] Missing required fields — blocked');
    return false;
  }
  try {
    await prisma.chatbotAppointment.create({
      data: {
        sessionId: sessionId ?? null,
        parentName: data.parent_name, childName: data.child_name, childAge: data.child_age || '',
        service: data.service || '', phone: data.phone,
        preferredTime: data.preferred_time ?? null, notes: data.notes ?? null,
        language: data.language ?? 'ar', status: 'pending', source: 'chatbot',
      },
    });
    return true;
  } catch (e) { console.error('[saveAppointment]', e.message); return false; }
}

async function callLLM(provider, messages, useTools = true) {
  const res = await fetch(provider.url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: 1024,
      temperature: 0.3,
      ...(useTools && { tools, tool_choice: 'auto' }),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[LLM Error]', res.status, err);
    throw new Error(`LLM API error: ${res.status}`);
  }
  return res.json();
}

router.post('/', async (req, res) => {
  try {
    const { messages, session_id, page_url, user_agent, is_new_session } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid messages' });
    }
    if (messages.length > 20) {
      return res.status(400).json({ error: 'Conversation too long. Please start a new chat.' });
    }
    if (messages.some(m => typeof m.content === 'string' && m.content.length > 2000)) {
      return res.status(400).json({ error: 'Message too long. Please shorten your message.' });
    }

    const provider = getProvider();
    if (!provider) return res.status(500).json({ error: 'Chatbot not configured' });

    const language = detectLanguage(messages);
    await upsertSession({ sessionId: session_id, language, pageUrl: page_url, userAgent: user_agent, isNew: is_new_session });

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) await saveMsg({ sessionId: session_id, role: 'user', content: lastUserMsg.content, language });

    const llmMessages = [
      { role: 'system', content: getSystemPrompt() },
      ...messages,
    ];

    const response = await callLLM(provider, llmMessages);
    const choice = response.choices?.[0]?.message;

    if (!choice) return res.status(500).json({ error: 'No response from AI' });

    if (choice.tool_calls?.length > 0) {
      const toolCall = choice.tool_calls[0];
      if (toolCall.function.name === 'book_appointment') {
        const args = JSON.parse(toolCall.function.arguments);
        const saved = await saveAppointment(args, session_id);

        const followUp = await callLLM(provider, [
          ...llmMessages,
          choice,
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: saved
              ? 'Appointment saved successfully. Tell the user their appointment is booked and the team will contact them within 24 hours.'
              : 'Booking FAILED because required information is missing. Ask the user for: parent full name, child name, child age, phone number. Collect them one by one.',
          },
        ], false);

        const raw = followUp.choices?.[0]?.message?.content ?? '';
        const replyText = cleanResponse(raw);
        if (replyText) await saveMsg({ sessionId: session_id, role: 'assistant', content: replyText, language });
        return res.json({ content: [{ type: 'text', text: replyText }] });
      }
    }

    const raw = choice.content ?? '';
    const replyText = cleanResponse(raw);
    if (replyText) await saveMsg({ sessionId: session_id, role: 'assistant', content: replyText, language });
    res.json({ content: [{ type: 'text', text: replyText }] });
  } catch (error) {
    console.error('[Chat API Error]', error);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
