import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shuffle, Heart, RotateCcw, ChevronDown, ChevronUp, History, X, CloudUpload, Globe } from 'lucide-react';
import { useAccount, useWriteContract } from 'wagmi';
import { allCards, getCardsByTags, shuffleArray, presets, tags, tagCategories } from '@shared';
import type { Card } from '@shared';
import { useGameSession } from '../store';
import { uploadToIPFS, computeContentHash } from '../lib/web3/ipfs';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/web3/config';

const CARD_STYLE = 'bg-card border border-border rounded-2xl';
const BTN_PRIMARY = 'h-[48px] rounded-2xl bg-foreground text-background font-bold text-sm border border-border flex items-center justify-center gap-2 transition-all disabled:opacity-40';

export default function GamesPage() {
  const { session, addToHistory, toggleFavorite, resetHistory } = useGameSession();
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(session.presetId);
  const [selectedTags, setSelectedTags] = useState<string[]>(session.selectedTags);
  const [showFilters, setShowFilters] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [cardKey, setCardKey] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const { isConnected, address, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const getFilteredCards = useCallback(() => {
    let cards: Card[];
    if (selectedPreset) {
      const preset = presets.find(p => p.id === selectedPreset);
      cards = preset ? getCardsByTags(preset.tags) : allCards;
    } else if (selectedTags.length > 0) {
      cards = getCardsByTags(selectedTags);
    } else {
      cards = allCards;
    }
    return cards.filter(c => !session.history.includes(c.id));
  }, [selectedPreset, selectedTags, session.history]);

  const drawCard = () => {
    const cards = getFilteredCards();
    if (cards.length === 0) return;
    setIsDrawing(true);
    setTimeout(() => {
      const shuffled = shuffleArray(cards) as Card[];
      setCurrentCard(shuffled[0]);
      addToHistory(shuffled[0].id);
      setCardKey(k => k + 1);
      setIsDrawing(false);
    }, 200);
  };

  const handleSync = async () => {
    if (!isConnected || !address || !chainId || syncing) return;
    const contractAddr = CONTRACT_ADDRESS[chainId];
    if (!contractAddr || contractAddr === '0x0000000000000000000000000000000000000000') return;

    setSyncing(true);
    try {
      const content = {
        version: '1.0',
        app: 'vibecard',
        type: 'game' as const,
        data: session,
        timestamp: Date.now(),
      };
      const contentJson = JSON.stringify(content);
      const [ipfsHash, contentHash] = await Promise.all([
        uploadToIPFS(content),
        computeContentHash(contentJson),
      ]);
      await writeContractAsync({
        address: contractAddr,
        abi: CONTRACT_ABI as any,
        functionName: 'publish',
        args: ['game', ipfsHash, contentHash],
      } as any);
      setSynced(true);
    } catch (error) {
      console.error('Failed to sync game to chain:', error);
      alert(`同步失败：${(error as Error)?.message ?? '未知错误'}`);
    } finally {
      setSyncing(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedPreset(null);
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const selectPreset = (presetId: string) => {
    setSelectedTags([]);
    setSelectedPreset(prev => prev === presetId ? null : presetId);
  };

  const filteredCount = getFilteredCards().length;
  const totalPlayed = session.history.length;
  const isFav = currentCard ? session.favorites.includes(currentCard.id) : false;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
        <h2 className="text-[18px] font-black text-foreground">互动卡片</h2>
        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              onClick={handleSync}
              disabled={syncing || synced}
              className={`w-8 h-8 rounded-lg flex items-center justify-center border border-border  transition-all ${
                synced
                  ? 'bg-muted text-foreground'
                  : 'bg-card text-muted-foreground'
              }`}
              title={synced ? '已保存到区块链' : '存到链上'}
            >
              {syncing ? (
                <div className="w-3.5 h-3.5 border border-muted-foreground border-t-foreground rounded-full animate-spin" />
              ) : synced ? (
                <Globe className="w-4 h-4" />
              ) : (
                <CloudUpload className="w-4 h-4" />
              )}
            </button>
          )}
          <button onClick={() => setShowHistory(true)} className="w-8 h-8 rounded-lg bg-card flex items-center justify-center border border-border  transition-all">
            <History className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="text-[11px] font-bold text-muted-foreground bg-card px-2.5 py-1 rounded-lg border border-border ">{totalPlayed} played</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-32 no-scrollbar">
        {/* Presets */}
        <div className="mb-5">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {presets.map(preset => (
              <button
                key={preset.id}
                onClick={() => selectPreset(preset.id)}
                className={`px-4 py-2.5 rounded-lg text-left transition-all border whitespace-nowrap shrink-0  transition-all ${
                  selectedPreset === preset.id
                    ? 'bg-foreground text-background border-border'
                    : 'bg-card border-border text-foreground'
                }`}
              >
                <span className="text-[14px] mr-1">{preset.icon}</span>
                <span className="text-[12px] font-bold">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filter Toggle */}
        <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2 pl-1">
          标签筛选 {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
              {tagCategories.slice(0, 4).map(cat => (
                <div key={cat.id} className="mb-2.5">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 pl-0.5">{cat.icon} {cat.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(tags).filter(([, def]) => def.category === cat.id).map(([key, def]) => (
                      <button key={key} onClick={() => toggleTag(key)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border  transition-all ${selectedTags.includes(key) ? 'text-white' : 'bg-muted text-muted-foreground border-border'}`} style={selectedTags.includes(key) ? { backgroundColor: def.color } : undefined}>
                        {def.icon} {def.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card Count */}
        <div className="text-[11px] text-muted-foreground font-bold text-center mb-3">
          {filteredCount > 0 ? `${filteredCount} cards remaining` : 'All cards played!'}
        </div>

        {/* Card Display */}
        <div className="flex flex-col items-center">
          <AnimatePresence mode="wait">
            {currentCard ? (
              <motion.div key={cardKey} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: -90, opacity: 0 }} transition={{ duration: 0.3 }} className={`w-full ${CARD_STYLE} p-7 mb-4 min-h-[180px] flex flex-col justify-center relative`}>
                <button onClick={() => toggleFavorite(currentCard.id)} className="absolute top-4 right-4">
                  <Heart className={`w-5 h-5 transition-colors ${isFav ? 'text-destructive fill-destructive' : 'text-muted-foreground'}`} />
                </button>
                <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">{currentCard.source}</div>
                <p className="text-[17px] font-bold text-foreground leading-relaxed mb-4">{currentCard.question}</p>
                <div className="flex flex-wrap gap-1">
                  {currentCard.tags.slice(0, 3).map(tag => {
                    const def = tags[tag];
                    return def ? (
                      <span key={tag} className="px-2 py-0.5 rounded-full text-[9px] font-bold text-white/90" style={{ backgroundColor: def.color }}>{def.name}</span>
                    ) : null;
                  })}
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`w-full bg-muted border border-border rounded-xl p-7 mb-4 min-h-[180px] flex flex-col items-center justify-center`}>
                <p className="text-[13px] font-bold text-muted-foreground text-center">选择一个主题，然后抽卡</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Buttons */}
          <div className="flex gap-3 w-full">
            {filteredCount === 0 && (
              <button onClick={resetHistory} className="w-[48px] h-[48px] rounded-xl bg-card  flex items-center justify-center border border-border ">
                <RotateCcw className="w-4 h-4 text-foreground" />
              </button>
            )}
            <button onClick={drawCard} disabled={isDrawing || filteredCount === 0} className={`flex-1 ${BTN_PRIMARY}`}>
              <Shuffle className="w-4 h-4" />
              {currentCard ? '下一张' : '抽卡'}
            </button>
          </div>
        </div>
      </div>

      {/* History Drawer */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistory(false)} className="absolute inset-0 bg-foreground/20 z-40" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[24px] p-5 pt-4 z-50 max-h-[70%] flex flex-col border-t border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[16px] font-black text-foreground">History & Favorites</h3>
                <button onClick={() => setShowHistory(false)} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center border border-border  transition-all"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {session.favorites.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Favorites ({session.favorites.length})</div>
                    {session.favorites.map(id => {
                      const card = allCards.find(c => c.id === id);
                      if (!card) return null;
                      return (
                        <div key={id} className="bg-muted border border-border rounded-xl p-3 mb-1.5 flex items-start gap-2 ">
                          <Heart className="w-3.5 h-3.5 text-destructive fill-destructive mt-0.5 shrink-0" />
                          <p className="text-[12px] font-medium text-foreground leading-snug">{card.question}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Played ({totalPlayed})</div>
                {totalPlayed === 0 && <p className="text-[12px] text-muted-foreground">No cards played yet</p>}
                {session.history.slice(-10).reverse().map(id => {
                  const card = allCards.find(c => c.id === id);
                  if (!card) return null;
                  return (
                    <div key={id} className="bg-muted border border-border rounded-xl p-2.5 mb-1 ">
                      <p className="text-[11px] font-medium text-muted-foreground leading-snug">{card.question}</p>
                    </div>
                  );
                })}
              </div>
              {totalPlayed > 0 && (
                <button onClick={() => { resetHistory(); setShowHistory(false); }} className="mt-3 w-full py-3 bg-muted border border-border rounded-full text-[12px] font-bold text-muted-foreground  transition-all">
                  Reset History
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
