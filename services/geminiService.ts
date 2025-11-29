
import { GoogleGenAI, Chat, GenerateContentResponse, HarmCategory, HarmBlockThreshold, Modality, Content } from "@google/genai";
import { Message, Role, AISettings } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const createChatSession = (settings: AISettings, previousHistory: Message[] = []) => {
  const safetySettings = settings.safetyLevel === 'none' ? [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
  ] : undefined;

  const history: Content[] = previousHistory
    .filter(msg => !msg.isSystemEvent && !msg.isError)
    .map(msg => ({
      role: msg.role,
      parts: msg.image 
        ? [{ text: msg.text }, { inlineData: { mimeType: msg.image.split(';')[0].split(':')[1], data: msg.image.split(',')[1] } }]
        : [{ text: msg.text }]
    }));

  return ai.chats.create({
    model: settings.model,
    history: history,
    config: {
      systemInstruction: settings.systemInstruction,
      safetySettings: safetySettings,
      // Tools removed as per user request for pure text responses
    },
  });
};

export const sendMessageStream = async (
  chat: Chat,
  text: string,
  imageData?: string
): Promise<AsyncIterable<GenerateContentResponse>> => {
  
  let messagePayload: any = { role: 'user', parts: [] };

  if (imageData) {
    const mimeType = imageData.split(';')[0].split(':')[1];
    const data = imageData.split(',')[1];

    messagePayload = [
        { inlineData: { mimeType: mimeType, data: data } },
        { text: text }
    ]
  } else {
    messagePayload = text;
  }
  
  return chat.sendMessageStream({ message: messagePayload });
};

export const generateSpeech = async (text: string) => {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });
    
    // Return base64 audio data
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

// --- REAL GENERATION FUNCTIONS (Kept for manual usage if needed, but disconnected from tools) ---

export const generateRealImage = async (prompt: string): Promise<string | null> => {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-3.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                aspectRatio: '1:1',
            },
        });
        
        const base64 = response.generatedImages?.[0]?.image?.imageBytes;
        if (base64) {
            return `data:image/png;base64,${base64}`;
        }
        return null;
    } catch (e) {
        console.error("Image gen failed", e);
        return null;
    }
}

export const generateRealVideo = async (prompt: string): Promise<string | null> => {
    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p', 
                aspectRatio: '16:9' 
            }
        });

        // Polling loop
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 sec
            operation = await ai.operations.getVideosOperation({operation: operation});
        }

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (videoUri) {
            // Must append key manually as per Veo docs
            return `${videoUri}&key=${process.env.API_KEY}`;
        }
        return null;

    } catch (e) {
        console.error("Video gen failed", e);
        return null;
    }
}
