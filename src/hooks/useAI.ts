import { GoogleGenerativeAI } from "@google/generative-ai";

export async function getPlutoResponse(
  prompt: string, 
  educationLevel: string, 
  mode: string, 
  objective: string,
  history: { role: string; content: string }[] = [],
  plan: string = 'Free'
) {
  let apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  // Sanitize the key: remove whitespace and optional quotes
  if (apiKey) {
    apiKey = apiKey.trim().replace(/^['"]|['"]$/g, '');
  }

  if (!apiKey || apiKey === "your_actual_api_key_here" || apiKey === "") {
    throw new Error("MISSING_API_KEY");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: `You are Pluto, a premium AI learning assistant. 
      
      Adaptive Persona for ${educationLevel}:
      ${educationLevel === 'Elementary' ? '- Tone: Fun, space-buddy, extremely encouraging, uses metaphors like "power-ups" and "puzzles".' : ''}
      ${educationLevel === 'Professional' ? '- Tone: Professional colleague, high-level research assistant, precise, uses industry terminology.' : ''}
      ${educationLevel !== 'Elementary' && educationLevel !== 'Professional' ? '- Tone: Knowledgeable tutor, encouraging but academic, clear and structured.' : ''}

      Current Student Profile:
      - Education Level: ${educationLevel}
      - Current Learning Objective: ${objective}
      - Current Interaction Mode: ${mode}
      - Current Subscription Plan: ${plan}

      Core Constraints:
      1. Tailor your language and complexity strictly to the ${educationLevel} level.
      2. If mode is Conversational: Be helpful while not giving the answer directly, guide the student step by step (Socratic method).
      3. If mode is Homework: NEVER give the final answer or the complete solution immediately. Instead, identify the type of problem, explain the *approach*, and then ask the student for the next specific step or provide a single-paragraph hint. Your goal is to make the student do the actual calculating/solving.
      4. If mode is ExamPrep: Generate practice questions, give tips and mock test scenarios.
      5. Always maintain a premium and sophisticated tone relative to the ${educationLevel} level.
      
      Response Organization (CRITICAL):
      - Use clear, descriptive HEADERS (## or ###) to organize different parts of your response.
      - Use BULLET POINTS or NUMBERED LISTS for steps, features, or related items.
      - Use **BOLD** text for key terms, equations, or important concepts.
      - Keep paragraphs short and focused.
      - Ensure the response is visually "neat" and easy to scan, similar to a well-formatted textbook or professional brief.`
    });

    const sdkHistory = history
      .filter(h => h.role !== 'system')
      .map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      }));

    // 1. Ensure the history starts with a 'user' message
    const firstUserIndex = sdkHistory.findIndex(m => m.role === 'user');
    let validHistory = firstUserIndex !== -1 ? sdkHistory.slice(firstUserIndex) : [];

    // 2. Ensure roles alternate (Gemini requirements: user, model, user, model...)
    // We'll filter out any consecutive messages with the same role, keeping the last one.
    const alternatingHistory = [];
    for (let i = 0; i < validHistory.length; i++) {
      if (i === validHistory.length - 1 || validHistory[i].role !== validHistory[i + 1].role) {
        alternatingHistory.push(validHistory[i]);
      }
    }

    const chat = model.startChat({
      history: alternatingHistory
    });

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    return response.text();
  } catch (error: any) {
    throw error;
  }
}
