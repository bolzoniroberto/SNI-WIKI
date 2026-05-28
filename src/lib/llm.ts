import { ChatOpenAI } from "@langchain/openai";

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("Manca OPENROUTER_API_KEY nel file .env");
}

export const llm = new ChatOpenAI({
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
