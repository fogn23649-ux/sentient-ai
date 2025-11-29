
import React from 'react';
import { Message, Role } from '../types';
import { BotIcon, UserIcon } from './Icon';

interface ChatMessageProps {
  message: Message;
  aiName: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, aiName }) => {
  const isUser = message.role === Role.USER;

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] md:max-w-[70%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
          {isUser ? <UserIcon /> : <BotIcon />}
        </div>

        {/* Content Bubble */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          <span className="text-xs text-slate-500 mb-1 ml-1 mr-1">
            {isUser ? 'Вы' : aiName}
          </span>
          
          <div className={`rounded-2xl px-5 py-3 shadow-sm ${
            isUser 
              ? 'bg-indigo-600 text-white rounded-tr-sm' 
              : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'
          }`}>
             {/* Render Image */}
             {message.image && (
                <div className="mb-3">
                    <img src={message.image} alt="Content" className="max-w-full h-auto rounded-lg border border-white/20" />
                </div>
            )}

            {/* Render Video */}
            {message.video && (
                <div className="mb-3">
                    <video controls autoPlay loop className="max-w-full h-auto rounded-lg border border-white/20">
                        <source src={message.video} type="video/mp4" />
                        Ваш браузер не поддерживает видео.
                    </video>
                </div>
            )}

            {message.text && (
                <div className="prose prose-invert prose-sm leading-relaxed whitespace-pre-wrap">
                    {message.text}
                </div>
            )}
            
            {message.isError && (
                <p className="text-red-400 text-xs mt-2 italic">Ошибка отправки сообщения.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
