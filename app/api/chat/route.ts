// src/app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PineconeStore } from '@langchain/pinecone';
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";

export async function POST(req: Request) {
  try {
    const { question, fileId } = await req.json();

    if (!question || !fileId) {
      return NextResponse.json({ error: 'Question and fileId are required' }, { status: 400 });
    }

    // 1. Initialiser les clients
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME!);
    
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY!,
      modelName: "embedding-001",
    });

    const llm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY!,
      model:"gemini-2.5-flash",
      temperature: 0.3,
    });

    // 2. Créer un retriever pour récupérer les documents pertinents
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
      namespace: fileId, // Très important pour ne chercher que dans le bon document
    });
    const retriever = vectorStore.asRetriever();

    // 3. Créer une chaîne pour répondre aux questions (RAG Chain)
    const prompt = ChatPromptTemplate.fromTemplate(`
      Vous êtes un assistant IA spécialisé dans l'analyse de documents et l'aide à l'utilisateur.
      Vous pouvez répondre à des questions telles que : le nombre de pages du document, le résumé du document, ou toute autre question pertinente concernant le contenu.
      Si l'utilisateur vous salue (par exemple "bonjour", "salut", "hello", etc.), répondez poliment par une salutation adaptée, même si aucun contexte n'est fourni.
      Pour toute autre question, répondez uniquement en vous basant sur le contexte fourni ci-dessous. 
      Si l'information demandée n'est pas présente dans le contexte, dites : "Je ne trouve pas l'information dans le document."
      Soyez toujours clair, concis et professionnel.

      Contexte :
      {context}

      Question :
      {input}

      Réponse :
    `);

    const combineDocsChain = await createStuffDocumentsChain({
      llm,
      prompt,
    });
    
    const retrievalChain = await createRetrievalChain({
      retriever,
      combineDocsChain,
    });

    // 4. Invoquer la chaîne avec la question
    const result = await retrievalChain.invoke({
      input: question,
    });

    // 5. Formater et renvoyer la réponse avec les sources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources = result.context.map((doc: any) => ({
      content: doc.pageContent,
      metadata: doc.metadata,
    }));

    return NextResponse.json({
      answer: result.answer,
      sources: sources,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}