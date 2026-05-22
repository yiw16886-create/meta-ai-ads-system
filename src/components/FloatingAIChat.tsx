import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bot, X, Send, Maximize2, Minimize2, GripHorizontal } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Message = {
  role: "user" | "ai";
  content: string;
};

export const FloatingAIChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: "你好！我是你的 AI 策略师，有任何广告跑量、防封或调整策略的问题都可以随时问我。" }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    
    const newMessages = [...messages, { role: "user" as const, content: inputValue.trim() }];
    setMessages(newMessages);
    setInputValue("");
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages })
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      
      if (!reader) throw new Error("No reader");
      
      setMessages(prev => [...prev, { role: "ai", content: "" }]);
      let aiContent = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') break;
            if (!dataStr) continue;
            
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                aiContent += `\n\n❌ ${parsed.error}`;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "ai", content: aiContent };
                  return updated;
                });
                break;
              }
              if (parsed.text) {
                aiContent += parsed.text;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "ai", content: aiContent };
                  return updated;
                });
              }
            } catch(e) {}
          }
        }
      }
    } catch (error) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "ai", content: "❌ 诊断中断，请检查网络链接或 API 配置" };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50"
            drag
            dragConstraints={{ left: -1000, right: 0, top: -1000, bottom: 0 }}
            dragElastic={0.1}
            dragMomentum={false}
          >
            <button
              onClick={() => setIsOpen(true)}
              className="bg-meta-blue hover:bg-blue-600 text-white rounded-full p-4 shadow-xl flex items-center justify-center transition-colors group relative"
            >
              <Bot className="w-6 h-6" />
              <span className="absolute -top-12 right-0 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                向 AI 提问 / 拖动图标
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              width: isMaximized ? "90vw" : 380,
              height: isMaximized ? "90vh" : 600,
              right: isMaximized ? "5vw" : 24,
              bottom: isMaximized ? "5vh" : 24,
            }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed z-50 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-gray-100"
            style={{
              position: "fixed",
            }}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-meta-blue to-blue-600 px-4 py-3 flex items-center justify-between text-white flex-shrink-0 cursor-default shadow-sm relative">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <span className="font-medium text-sm">AI 策略分析师</span>
              </div>
              <div className="flex items-center gap-1 text-white/80">
                <button 
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-1 hover:bg-white/20 rounded-md transition-colors"
                >
                  {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-white/20 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div 
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === "user" 
                        ? "bg-meta-blue text-white rounded-br-sm" 
                        : "bg-white text-gray-800 border border-gray-100 shadow-sm rounded-bl-sm"
                    }`}
                  >
                    {msg.role === "ai" ? (
                      <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-gray-100 prose-pre:text-gray-800 markdown-body">
                        {msg.content === "" ? (
                          <div className="flex items-center gap-1.5 h-5">
                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        ) : (
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white border-t border-gray-100 flex-shrink-0">
              <div className="relative flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 focus-within:border-meta-blue focus-within:ring-1 focus-within:ring-meta-blue transition-all px-3 py-2">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="询问策略... (Enter发送，Shift+Enter换行)"
                  className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[40px] text-sm py-1"
                  rows={Math.min(4, inputValue.split('\n').length)}
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  className="mb-1 p-2 rounded-lg bg-meta-blue text-white disabled:bg-gray-300 disabled:text-gray-500 transition-colors flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
