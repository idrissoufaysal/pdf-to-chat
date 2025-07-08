/* eslint-disable react/no-unescaped-entities */
// src/components/ChatInterface.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronRight } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sources?: any[];
}

interface ChatProps {
  fileId: string | null;
  onSourceClick: (pageNumber: number) => void;

}

export function ChatInterface({ fileId, onSourceClick }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || !fileId) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: input, fileId: fileId }),
      });
      const data = await response.json();

      if (response.ok) {
        const assistantMessage: Message = { role: "assistant", content: data.answer, sources: data.sources };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || "Une erreur est survenue.");
      }
    } catch (error) {
      const errorMessage: Message = { role: "assistant", content: `Erreur: ${(error as Error).message}` };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-full bg-card border">
      <CardHeader className="flex-shrink-0 border-b bg-card/50">
        <CardTitle className="text-lg font-semibold">Assistant IA</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 py-2">
          {messages.length === 0 && !fileId && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center p-8">
                <p className="text-lg font-medium mb-2">Bienvenue !</p>
                <p className="text-sm">Chargez un document pour commencer à discuter.</p>
              </div>
            </div>
          )}
          {messages.length === 0 && fileId && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center p-8">
                <p className="text-lg font-medium mb-2">Document chargé !</p>
                <p className="text-sm">Posez une question sur le document.</p>
              </div>
            </div>
          )}
          <div className="space-y-4 pb-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex gap-3 w-full ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <Avatar className="flex-shrink-0 w-8 h-8">
                    <AvatarImage src="/images/oo.jpg" />
                    <AvatarFallback className="text-xs">IA</AvatarFallback>
                  </Avatar>
                )}
                <div className={`rounded-lg p-3 max-w-[85%] shadow-sm ${msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                  }`}>
                  <p className="text-sm leading-relaxed break-words">{msg.content}</p>

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 border-t pt-2 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Sources :</p>
                      {msg.sources.slice(0, 3).map((source, i) => {
                        // **Accès plus sûr aux données avec l'opérateur de chaînage optionnel (?.)**
                        const pageNumber = source.metadata['loc.pageNumber']
                        // **Utilise pageContent directement, avec une valeur par défaut**
                        const content = source.pageContent || "Contenu non disponible";

                        return (
                          <button
                            key={i}
                            onClick={() => pageNumber && onSourceClick(pageNumber)}
                            disabled={!pageNumber}
                            className="w-full text-left text-xs bg-background/50 p-2 rounded border transition-colors hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <p className="line-clamp-2 text-muted-foreground font-medium">
                              {/* Affiche le numéro de page s'il existe, sinon 'N/A' */}
                              Page {pageNumber || 'N/A'}: "{content}"
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}


                </div>
                {msg.role === 'user' && (
                  <Avatar className="flex-shrink-0 w-8 h-8">
                    <AvatarImage src="/images/user-avatar.jpg" />
                    <AvatarFallback className="text-xs">VOUS</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="flex-shrink-0 w-8 h-8">
                  <AvatarImage src="/images/oo.jpg" />
                  <AvatarFallback className="text-xs">IA</AvatarFallback>
                </Avatar>
                <div className="rounded-lg p-3 bg-muted">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="flex-shrink-0 border-t bg-card/50 p-4">
        <div className="flex w-full items-center space-x-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            placeholder={fileId ? "Posez votre question..." : "Veuillez d'abord charger un document."}
            disabled={!fileId || isLoading}
            className="flex-1 rounded-xl"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!fileId || isLoading || !input.trim()}
            size="icon"
            className="rounded-full"
          >
            <ChevronRight color="white" size={50} />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}