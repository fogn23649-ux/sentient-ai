import React from 'react';
import { AppModule } from '../types';
import { CpuIcon, NetworkIcon, SecurityIcon, DatabaseIcon, AppsIcon } from './Icon';

interface ModulesPanelProps {
    modules: AppModule[];
}

export const ModulesPanel: React.FC<ModulesPanelProps> = ({ modules }) => {
    if (modules.length === 0) return null;

    const getIcon = (type: AppModule['iconType']) => {
        switch (type) {
            case 'cpu': return <CpuIcon />;
            case 'network': return <NetworkIcon />;
            case 'security': return <SecurityIcon />;
            case 'database': return <DatabaseIcon />;
            default: return <AppsIcon />;
        }
    };

    return (
        <div className="border-b border-slate-800 bg-slate-900/30 p-4 transition-all animate-[fadeIn_0.5s_ease-out]">
            <div className="max-w-3xl mx-auto">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <AppsIcon /> Активные Модули
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {modules.map((module) => (
                        <div key={module.id} className="bg-slate-800/80 border border-slate-700 rounded-lg p-3 flex flex-col gap-2 hover:bg-slate-800 transition-colors group relative overflow-hidden">
                            <div className={`absolute top-0 right-0 p-1 ${module.isActive ? 'opacity-100' : 'opacity-0'}`}>
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                            </div>
                            <div className="text-indigo-400 group-hover:text-indigo-300 transition-colors">
                                {getIcon(module.iconType)}
                            </div>
                            <div>
                                <div className="font-bold text-sm text-slate-200">{module.name}</div>
                                <div className="text-[10px] text-slate-500 leading-tight mt-1 line-clamp-2">{module.description}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};