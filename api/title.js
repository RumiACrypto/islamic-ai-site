// This file runs on the SERVER (Vercel), never in the visitor's browser.
// Generates a short topic title for a conversation, based on its first
// exchange, so the sidebar can show something meaningful instead of
// just "New conversation".

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userText, replyText } = req.body;
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    const prompt = `Based on this exchange, write a short topic title (3-6 words, no quotes, no punctuation at the end) that summarizes what the conversation is about. Do not answer the question, just title it.

User: ${(userText || '').slice(0, 300)}
Assistant: ${(replyText || '').slice(0, 300)}

Title:`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0.3
      })
    });

    const data = await groqResponse.json();

    if (data.error) {
      console.error('Groq error (title):', data.error);
      return res.status(200).json({ title: (userText || 'New conversation').slice(0, 40) });
    }

    let title = data.choices?.[0]?.message?.content || '';

    // Same safety strip as the main chat endpoint, in case a reasoning
    // model leaks <think> tags here too.
    title = title.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    title = title.replace(/<think>[\s\S]*$/gi, '').trim();

    // Clean up stray quotes the model sometimes adds around the title
    title = title.replace(/^["']|["']$/g, '').trim();

    if (!title) {
      title = (userText || 'New conversation').slice(0, 40);
    }

    // Hard cap length regardless of what the model returned
    if (title.length > 60) {
      title = title.slice(0, 60).trim();
    }

    return res.status(200).json({ title });

  } catch (err) {
    console.error('Server error (title):', err);
    return res.status(200).json({ title: 'New conversation' });
  }
}
