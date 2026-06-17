const express = require('express');
const prisma = require('../db');
const { getSystemPrompt } = require('../chatbot/system-prompt');

const router = express.Router();

// Auto-detect provider: Groq (free) → Gemini → DeepSeek
function getProvider() {
  if (process.env.GROQ_API_KEY) return {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
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
      description: 'Save appointment request when ALL required info is collected.',
      parameters: {
        type: 'object',
        properties: {
          parent_name:    { type: 'string', description: 'Full name of parent/guardian' },
          child_name:     { type: 'string', description: 'Name of the child' },
          child_age:      { type: 'string', description: 'Age of the child' },
          service:        { type: 'string', description: 'Therapy service interested in' },
          phone:          { type: 'string', description: 'Contact phone/WhatsApp number' },
          preferred_time: { type: 'string', description: 'Preferred appointment time/days' },
          notes:          { type: 'string', description: 'Additional notes or concerns' },
          language:       { type: 'string', enum: ['ar', 'en'], description: 'Conversation language' },
        },
        required: ['parent_name', 'child_name', 'child_age', 'service', 'phone'],
      },
    },
  },
];

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
  try {
    await prisma.chatbotAppointment.create({
      data: {
        sessionId: sessionId ?? null,
        parentName: data.parent_name, childName: data.child_name, childAge: data.child_age,
        service: data.service, phone: data.phone,
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

    // Handle tool calls (appointment booking)
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
              ? 'Appointment saved successfully.'
              : 'Failed to save. Ask the user to try again or contact us directly.',
          },
        ], false);

        const replyText = followUp.choices?.[0]?.message?.content ?? '';
        if (replyText) await saveMsg({ sessionId: session_id, role: 'assistant', content: replyText, language });
        return res.json({ content: [{ type: 'text', text: replyText }] });
      }
    }

    const replyText = choice.content ?? '';
    if (replyText) await saveMsg({ sessionId: session_id, role: 'assistant', content: replyText, language });
    res.json({ content: [{ type: 'text', text: replyText }] });
  } catch (error) {
    console.error('[Chat API Error]', error);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
