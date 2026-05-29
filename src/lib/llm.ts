import { ChatOpenAI } from "@langchain/openai";

let _llm: ChatOpenAI | null = null;

export function getLLM(): ChatOpenAI {
  if (!_llm) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("Manca OPENROUTER_API_KEY nel file .env");
    }
    _llm = new ChatOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.1-70b-instruct",
      temperature: 0.2,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/bolzoniroberto/SNI-WIKI",
          "X-Title": "SNI HR Wiki",
        },
      },
    });
  }
  return _llm;
}

// Proxy "transparente" per chi vuole importare `llm` come prima.
export const llm = new Proxy({} as ChatOpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getLLM(), prop, receiver);
  },
});
