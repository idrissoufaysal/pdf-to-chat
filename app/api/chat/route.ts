// src/app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PineconeStore } from '@langchain/pinecone';
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";


export async function POST(req: Request) {
  try {
    const { messages, fileId } = await req.json();

    if (!messages || messages.length === 0 || !fileId) {
      return NextResponse.json({ error: 'Messages and fileId are required' }, { status: 400 });
    }

     // La dernière question de l'utilisateur
     const currentMessageContent = messages[messages.length - 1].content;
     // L'historique des messages précédents
     const history = messages.slice(0, -1).map((msg: { role: string, content: string }) => 
       msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
     );

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


       // 1. Chaîne pour reformuler la question de l'utilisateur en utilisant l'historique
       const historyAwarePrompt = ChatPromptTemplate.fromMessages([
        // Ici, on insère l'historique du chat
        new MessagesPlaceholder("chat_history"),
        ["user", "{input}"],
        ["user", "Compte tenu de la conversation ci-dessus, génère une question de recherche autonome pour trouver des informations pertinentes pour la conversation."],
      ]);
  
      const historyAwareRetrieverChain = await createHistoryAwareRetriever({
        llm,
        retriever,
        rephrasePrompt: historyAwarePrompt,
      });


       // 2. Chaîne pour répondre à la question, en utilisant le contexte trouvé et l'historique
    const answerPrompt = ChatPromptTemplate.fromMessages([
      ["system", `Vous êtes un assistant IA spécialisé dans l'analyse de documents et l'aide à l'utilisateur.
      Vous pouvez répondre à des questions telles que : le nombre de pages du document, le résumé du document, ou toute autre question pertinente concernant le contenu.
      Si l'utilisateur vous salue (par exemple "bonjour", "salut", "hello", etc.), répondez poliment par une salutation adaptée, même si aucun contexte n'est fourni.
      Pour toute autre question, répondez uniquement en vous basant sur le contexte fourni ci-dessous. 
      Si l'information demandée n'est pas présente dans le contexte, dites : "Je ne trouve pas l'information dans le document."
      Soyez toujours clair, concis et professionnel.

      Contexte :
      {context}`],
      // On insère aussi l'historique ici pour que la réponse soit naturelle
      new MessagesPlaceholder("chat_history"),
      ["user", "{input}"],
    ]);

    const combineDocsChain = await createStuffDocumentsChain({ llm, prompt: answerPrompt });
   
    // 3. On combine le tout dans la chaîne finale
    const retrievalChain = await createRetrievalChain({
      retriever: historyAwareRetrieverChain, // On utilise notre nouveau retriever "intelligent"
      combineDocsChain,
    });
    
     // 4. Invoquer la chaîne avec l'historique et la nouvelle question
     const result = await retrievalChain.invoke({
      chat_history: history,
      input: currentMessageContent,
    });

   // ---- AJOUT DE DÉBOGAGE ----
console.log("Documents récupérés depuis Pinecone (contexte):", JSON.stringify(result.context, null, 2));
// ----------------------------

  
    // 5. Formater et renvoyer la réponse avec les sources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources = result.context.map((doc: any) => ({
      pageContent: doc.pageContent,
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