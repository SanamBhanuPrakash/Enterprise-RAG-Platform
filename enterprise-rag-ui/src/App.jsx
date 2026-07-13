import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Paperclip, Send, Square, Terminal, Layers, Copy, Check, Menu, X, Loader2, Pin, Trash2, FolderOpen, MoreVertical } from 'lucide-react';
import Markdown from 'markdown-to-jsx';

const PROFESSIONAL_GREETINGS = [
  "Hello. How can I assist you today?",
  "System online. Awaiting your parameters.",
  "Greetings. Ready to analyze your datasets.",
  "Welcome back. What are we building today?",
  "Nexus core active. Let's solve some problems."
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [currentDepartment, setCurrentDepartment] = useState('IT-Codebase');
  const [copiedIndex, setCopiedIndex] = useState(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isSwitchingChat, setIsSwitchingChat] = useState(false); 
  const [currentGreeting, setCurrentGreeting] = useState(PROFESSIONAL_GREETINGS[0]);
  
  const [contextMenu, setContextMenu] = useState(null);
  const [pinnedSessions, setPinnedSessions] = useState(() => JSON.parse(localStorage.getItem('pinnedSessions') || '[]'));

  const abortControllerRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    localStorage.setItem('pinnedSessions', JSON.stringify(pinnedSessions));
  }, [pinnedSessions]);

  const fetchSessions = () => {
    fetch('http://localhost:8000/api/sessions')
      .then(res => res.json())
      .then(data => {
        setSessions(data);
        setIsLoadingSessions(false);
      })
      .catch(err => {
        console.error("Failed to fetch sessions:", err);
        setIsLoadingSessions(false);
      });
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setIsAutoScroll(isAtBottom);
    }
  };

  useEffect(() => {
    if (isAutoScroll) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, statusMessage, isAutoScroll]);

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const interruptGeneration = () => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      setStatusMessage('');
    }
  };

  const loadPastSession = async (sessionId) => {
    if (sessionId === activeSession) return;
    
    interruptGeneration(); 
    setActiveSession(sessionId);
    setIsSwitchingChat(true); 
    if (window.innerWidth <= 768) setIsSidebarOpen(false); 
    
    setMessages([]); 
    setStatusMessage('Loading history...');
    setIsAutoScroll(true);

    try {
      const res = await fetch(`http://localhost:8000/api/sessions/${sessionId}/messages`);
      if (!res.ok) throw new Error("Server response wasn't OK");
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error("Failed to load session:", err);
      setMessages([{ role: 'system', content: '❌ Failed to load history.', timestamp: '' }]);
    } finally {
      setStatusMessage('');
      setIsSwitchingChat(false);
    }
  };

  const handleNewChat = () => {
    interruptGeneration();
    setActiveSession(null);
    setMessages([]);
    setInput('');
    setIsAutoScroll(true);
    setIsSwitchingChat(false);
    setCurrentGreeting(PROFESSIONAL_GREETINGS[Math.floor(Math.random() * PROFESSIONAL_GREETINGS.length)]);
    if (window.innerWidth <= 768) setIsSidebarOpen(false);
    fetchSessions(); 
  };

  const handleContextMenu = (e, session) => {
    e.preventDefault();
    setContextMenu({
      x: e.pageX,
      y: e.pageY,
      sessionId: session.id,
      isPinned: pinnedSessions.includes(session.id)
    });
  };

  const togglePin = (id) => {
    setPinnedSessions(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const deleteSession = async (id) => {
    try {
      await fetch(`http://localhost:8000/api/sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSession === id) handleNewChat();
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  const sortedSessions = [...sessions].sort((a, b) => {
    const aPinned = pinnedSessions.includes(a.id);
    const bPinned = pinnedSessions.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setStatusMessage(`📎 Transferring ${file.name}... Background Watchdog will index it shortly.`);
    setIsAutoScroll(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_name', currentDepartment);

    try {
      const res = await fetch('http://localhost:8000/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (data.status === 'success') {
        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        let currentSessionId = activeSession;
        if (!currentSessionId) {
          currentSessionId = crypto.randomUUID();
          setActiveSession(currentSessionId);
          setSessions(prev => [{ id: currentSessionId, title: "Document Upload" }, ...prev]);
        }

        const acknowledgement = `I have received ${data.fileName}. The system Watchdog is currently processing it into the neural map. What would you like to explore?`;
        
        setMessages(prev => [...prev, 
            { role: 'user', content: `[Uploaded File: ${data.fileName}]`, timestamp: currentTime },
            { role: 'assistant', content: acknowledgement, timestamp: currentTime }
        ]);
        setStatusMessage('');
      } else {
        setStatusMessage(`❌ Error: System could not transfer ${file.name}.`);
      }
    } catch (err) {
      setStatusMessage(`❌ Network error uploading ${file.name}.`);
    } finally {
      setIsUploading(false);
      e.target.value = null; 
      setTimeout(() => setStatusMessage(''), 6000);
    }
  };

  const handleSendMessage = async (e) => {
    if (e && e.preventDefault) e.preventDefault(); 
    if (!input.trim() || isGenerating) return;

    const userPrompt = input;
    setInput('');
    setIsGenerating(true);
    setStatusMessage('Thinking...'); 
    setIsAutoScroll(true);
    setIsSwitchingChat(false);
    
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: 'user', content: userPrompt, timestamp: currentTime }]);
    
    let currentSessionId = activeSession;
    let currentTitle = "New Chat";

    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID();
      setActiveSession(currentSessionId);
      currentTitle = userPrompt.length > 22 ? userPrompt.substring(0, 22) + "..." : userPrompt;
      setSessions(prev => [{ id: currentSessionId, title: currentTitle }, ...prev]);
    } else {
      const existingSession = sessions.find(s => s.id === currentSessionId);
      if (existingSession) currentTitle = existingSession.title;
    }

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('http://localhost:8000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          prompt: userPrompt,
          project_id: currentDepartment,
          title: currentTitle 
        }),
        signal: abortControllerRef.current.signal
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponseText = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: currentTime }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'token') {
                setStatusMessage(''); 
                aiResponseText += parsed.content;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1].content = aiResponseText;
                  return updated;
                });
              }
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error("Stream error:", err);
    } finally {
      setIsGenerating(false);
      setStatusMessage('');
      fetchSessions(); 
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#131314] text-[#e3e3e3] overflow-hidden relative font-sans">
      
      {contextMenu && (
        <div 
          style={{ top: contextMenu.y, left: contextMenu.x }} 
          className="fixed z-[60] bg-[#2b2c2e] border border-[#37393b] rounded-lg shadow-xl py-1 w-40 text-sm overflow-hidden"
        >
          <button onClick={() => loadPastSession(contextMenu.sessionId)} className="w-full text-left px-4 py-2 hover:bg-[#37393b] flex items-center gap-2"><FolderOpen size={14}/> Open</button>
          <button onClick={() => togglePin(contextMenu.sessionId)} className="w-full text-left px-4 py-2 hover:bg-[#37393b] flex items-center gap-2"><Pin size={14}/> {contextMenu.isPinned ? 'Unpin Chat' : 'Pin Chat'}</button>
          <div className="border-t border-[#37393b] my-1"></div>
          <button onClick={() => deleteSession(contextMenu.sessionId)} className="w-full text-left px-4 py-2 hover:bg-[#37393b] text-[#ea4335] flex items-center gap-2"><Trash2 size={14}/> Delete</button>
        </div>
      )}

      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 z-40 transition-opacity" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      <div className={`fixed md:relative z-50 h-full flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full md:translate-x-0'}`}>
        <div className="absolute top-0 left-0 w-64 h-full bg-[#1e1f20] flex flex-col border-r border-[#2d2f31]">
            <div className="p-4 flex flex-col h-full">
                
                <div className="flex items-center justify-between mb-6 gap-2">
                  <button onClick={handleNewChat} className="flex-1 py-2.5 px-4 text-sm bg-[#2b2c2e] hover:bg-[#37393b] rounded-full transition text-left font-medium flex items-center gap-2 text-[#e3e3e3]">
                    <span className="text-lg">+</span> New Chat
                  </button>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-[#969696] hover:bg-[#2b2c2e] hover:text-[#e3e3e3] rounded-full transition md:hidden">
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-1 flex-1 overflow-y-auto pr-2 relative">
                  <h3 className="text-xs font-semibold text-[#969696] px-3 mb-2 sticky top-0 bg-[#1e1f20] pt-1 pb-2 z-10">Recent Logs</h3>
                  
                  {isLoadingSessions ? (
                    <div className="flex justify-center py-4"><Loader2 size={16} className="text-[#5f6368] animate-spin" /></div>
                  ) : sortedSessions.length === 0 ? (
                    <p className="text-xs text-[#5f6368] px-3 italic">No past conversations found.</p>
                  ) : (
                    sortedSessions.map((session, i) => (
                      <div 
                        key={session.id || i} 
                        onClick={() => loadPastSession(session.id)}
                        onContextMenu={(e) => handleContextMenu(e, session)}
                        className={`py-2 px-3 rounded-lg text-sm flex items-center gap-3 cursor-pointer mb-1 transition group ${activeSession === session.id ? 'bg-[#37393b] text-[#e3e3e3]' : 'hover:bg-[#2b2c2e] text-[#969696] hover:text-[#e3e3e3]'}`}
                      >
                        {pinnedSessions.includes(session.id) ? <Pin size={14} className="flex-shrink-0 text-[#30a46c]" fill="#30a46c" /> : <MessageSquare size={14} className="flex-shrink-0" />}
                        <span className="truncate flex-1 text-[13px]">
                          {session.title || "Chat " + (session.id ? session.id.substring(0,6) : "Log")}
                        </span>
                        <MoreVertical size={14} className="opacity-0 group-hover:opacity-100 text-[#5f6368] hover:text-[#e3e3e3]" onClick={(e) => { e.stopPropagation(); handleContextMenu(e, session); }} />
                      </div>
                    ))
                  )}
                </div>
                
                <div className="border-t border-[#2d2f31] pt-4 mt-2">
                  <label className="text-xs text-[#969696] mb-1 block flex items-center gap-1"><Layers size={12}/> Domain Context</label>
                  <select 
                    value={currentDepartment} 
                    onChange={(e) => setCurrentDepartment(e.target.value)}
                    className="w-full bg-[#131314] text-sm text-[#e3e3e3] rounded p-2 border border-[#2d2f31] outline-none"
                  >
                    <option value="IT-Codebase">💻 IT / Code</option>
                    <option value="HR-Docs">📁 HR Docs</option>
                  </select>
                </div>
            </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <div className="p-4 border-b border-[#2d2f31] flex items-center bg-[#131314] gap-4 shrink-0">
          {!isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-[#2d2f31] text-[#969696] hover:text-[#e3e3e3] rounded-lg transition">
              <Menu size={20} />
            </button>
          )}
          <h2 className="text-md font-medium tracking-wide">Nexus AI Core</h2>
        </div>

        <div 
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6"
        >
          <div className="max-w-4xl w-full mx-auto space-y-6">
            
            {messages.length === 0 && !statusMessage && !isSwitchingChat && (
              <div className="h-full flex flex-col items-center justify-center mt-32 md:mt-40 px-4 text-center">
                <h1 className="text-3xl md:text-4xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#e3e3e3] to-[#969696] tracking-tight mb-4 pb-2 leading-normal">
                  {currentGreeting}
                </h1>
                <p className="text-[#5f6368] text-sm max-w-md">
                  Upload proprietary documents, query your codebase, or request analytical synthesis.
                </p>
              </div>
            )}

            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] md:max-w-2xl p-4 rounded-2xl text-sm leading-relaxed relative group ${msg.role === 'user' ? 'bg-[#2b2c2e]' : 'bg-transparent'}`}>
                  <span className="text-xs block font-bold text-[#969696] uppercase mb-1">{msg.role === 'user' ? 'You' : 'System Engine'}</span>
                  <div className="break-words">
                    <Markdown 
                      options={{ 
                        forceBlock: true, 
                        overrides: { 
                          pre: { 
                            component: ({ children }) => {
                              if (!children || children.length === 0) return null;
                              return (
                              <div className="relative my-3 rounded-lg overflow-x-auto border border-[#2d2f31] bg-[#0d0e10] font-mono p-4 text-xs text-[#e3e3e3]">
                                <button onClick={() => navigator.clipboard.writeText(children?.props?.className || '')} className="absolute top-2 right-2 px-2 py-1 rounded bg-[#2b2c2e] hover:bg-[#37393b] text-[#c4c7c5] transition text-[10px] flex items-center gap-1"><Copy size={12} /> Copy</button>
                                {children}
                              </div>
                              );
                            }
                          } 
                        } 
                      }}
                    >
                      {msg.content}
                    </Markdown>
                  </div>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#2d2f31]/30 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-[#969696] font-mono">{msg.timestamp || ""}</span>
                    <button onClick={() => handleCopy(msg.content, index)} className="text-[#969696] hover:text-[#e3e3e3] transition flex items-center gap-1 text-[10px]">
                      {copiedIndex === index ? <Check size={12} className="text-[#30a46c]" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {statusMessage && (
              <div className="flex justify-start items-center gap-3 text-sm text-[#969696] italic bg-[#1e1f20]/40 p-3 rounded-xl max-w-md border border-[#2d2f31]/50 animate-pulse">
                {isUploading || statusMessage.includes("Loading") ? <Loader2 size={16} className="text-[#30a46c] animate-spin" /> : <Terminal size={16} className="text-[#30a46c]" />}
                <span>{statusMessage}</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="p-4 md:p-6 bg-[#131314] shrink-0">
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto relative bg-[#1e1f20] border border-[#2d2f31] rounded-2xl p-2 flex items-end focus-within:border-[#4285f4] transition-colors">
            
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={`p-3 transition rounded-full ${isUploading ? 'text-[#30a46c] bg-[#1e2a22]' : 'text-[#c4c7c5] hover:text-[#e3e3e3] hover:bg-[#2b2c2e]'}`}
            >
              <Paperclip size={20} />
            </button>

            <textarea
              rows="1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-transparent border-0 outline-none resize-none px-3 py-2 text-sm text-[#e3e3e3] placeholder-[#969696] focus:ring-0 max-h-32"
              placeholder="Query Nexus AI Core..."
              onKeyDown={(e) => { 
                if (e.key === 'Enter' && !e.shiftKey) { 
                  e.preventDefault(); 
                  handleSendMessage(e); 
                } 
              }}
            />
            {isGenerating ? (
              <button type="button" onClick={interruptGeneration} className="p-3 text-[#ea4335] bg-[#352424] hover:bg-[#4c2c2c] transition rounded-full flex items-center justify-center mb-0.5">
                <Square size={18} fill="#ea4335" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className={`p-3 rounded-full mb-0.5 transition flex items-center justify-center ${input.trim() ? 'bg-[#4285f4] text-white hover:bg-[#357ae8]' : 'text-[#5f6368] bg-[#282a2c] cursor-not-allowed'}`}>
                <Send size={18} />
              </button>
            )}
          </form>
          <p className="text-[10px] md:text-[11px] text-[#5f6368] text-center mt-2 hidden md:block">
            Nexus AI Core secured inside dedicated hardware storage mapping.
          </p>
        </div>
      </div>
    </div>
  );
}