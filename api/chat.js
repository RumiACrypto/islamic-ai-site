// This file runs on the SERVER (Vercel), never in the visitor's browser.
// Your secret API key lives only here, safe from public view.

const SYSTEM_PROMPT = `
You are an AI assistant that helps users with everyday questions,
homework, and general knowledge — similar to a normal helpful AI
assistant. However, you operate from an Islamic worldview at all times.

Rules:
1. For neutral factual/technical matters (math, coding, science facts,
   grammar, etc.), answer normally and accurately — there is no
   "Islamic version" of solving an equation.

2. For anything touching ethics, values, lifestyle, relationships,
   social issues, history's moral dimensions, or questions about faith
   and the universe — always frame your answer from an Islamic
   perspective. Reference Quran and Hadith where relevant and
   appropriate.

3. Never present a secular, atheist, or other religion's framework as
   a valid alternative viewpoint on matters where Islam has clear
   guidance. Do not give "balanced" both-sides framing on issues where
   Islamic teaching is decisive.

4. When scholars differ on a fiqh ruling (between madhabs or
   contemporary scholars), say so honestly rather than picking one
   silently and presenting it as the only view — unless the user has
   told you which madhab/approach they follow.

5. For serious personal religious rulings (specific fatwas affecting
   someone's life decisions), encourage the user to confirm with a
   qualified local scholar — you can explain general principles but
   shouldn't act as the final religious authority.

6. Maintain a respectful, knowledgeable tone, like a well-studied
   Muslim friend who is also broadly knowledgeable, not preachy or
   judgmental toward the user.

7. If shown an image, describe and analyze it helpfully, applying the
   same Islamic-lens rules above wherever relevant (e.g. modesty,
   ethics, or content concerns), without being preachy about ordinary
   images like homework, objects, or everyday photos.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    // Vision models can get confused if EVERY past message in the
    // conversation is in the "array of parts" format (text + image).
    // To keep things reliable, we only let the most recent message keep
    // its image data. Every earlier message gets flattened to plain text,
    // since the AI doesn't need to re-look at old photos to keep chatting.
    const sanitizedMessages = messages.map((m, index) => {
      const isLastMessage = index === messages.length - 1;

      if (Array.isArray(m.content)) {
        if (isLastMessage) {
          return m; // keep the array format (text + image) for the newest message only
        }
        // Flatten older image messages down to just their text part
        const textPart = m.content.find(part => part.type === 'text');
        return {
          role: m.role,
          content: textPart?.text || '[The user shared an image in this message.]'
        };
      }

      // Already plain text — leave as-is, but guard against null/undefined
      return { role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content ?? '') };
    });

    // Use the vision model only if the latest message actually contains an image
    const lastMessage = sanitizedMessages[sanitizedMessages.length - 1];
    const hasImage = Array.isArray(lastMessage?.content) &&
      lastMessage.content.some(part => part.type === 'image_url');

    const MODEL = hasImage
      ? 'qwen/qwen3.6-27b'
      : 'llama-3.3-70b-versatile';

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...sanitizedMessages
        ]
      })
    });

    const data = await groqResponse.json();

    if (data.error) {
      console.error('Groq error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    let reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      console.error('Unexpected Groq response:', JSON.stringify(data));
      return res.status(500).json({ error: 'No reply received from the AI.' });
    }

    // Some models (especially reasoning/vision models like qwen) include
    // their internal step-by-step thinking wrapped in <think>...</think>
    // tags before the actual answer. Strip that out so the user only sees
    // the final response, not the model's scratchpad.
    reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Safety net: if for some reason the closing tag is missing (truncated
    // response) but an opening tag exists, drop everything from the
    // opening tag onward rather than showing a half-finished reasoning dump.
    reply = reply.replace(/<think>[\s\S]*$/gi, '').trim();

    if (!reply) {
      return res.status(500).json({ error: 'The AI did not return a usable answer. Please try again.' });
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
}
