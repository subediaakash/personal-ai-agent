import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, UIMessage } from "ai";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSystemPrompt } from "@/lib/system-prompt";
import { aiTools } from "@/lib/tools";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
        model: openai("gpt-5-nano"),
        system: getSystemPrompt(),
        messages: convertToModelMessages(messages),
        tools: aiTools,
    });

    return result.toUIMessageStreamResponse();
}
