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
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;

    // Groq uses the same message format as OpenAI: a "system" role message
    // plus the conversation history, sent together.
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const MODEL = 'llama-3.3-70b-versatile';

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
          ...messages
        ]
      })
    });

    const data = await groqResponse.json();

    if (data.error) {
      console.error('Groq error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      console.error('Unexpected Groq response:', JSON.stringify(data));
      return res.status(500).json({ error: 'No reply received from the AI.' });
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
}
