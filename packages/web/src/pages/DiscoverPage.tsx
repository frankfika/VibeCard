import { useState } from 'react';
import { MapPin, Users, Plus, X, Clock, Check, CloudUpload, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAccount } from 'wagmi';
import { companionTypes } from '@shared';
import { useActivities } from '../store';

const CARD_STYLE = 'bg-card border border-border rounded-2xl';
const INPUT_STYLE = 'w-full bg-card border border-border rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-0 focus:border-foreground';
const BTN_PRIMARY = 'w-full h-[48px] rounded-2xl bg-foreground text-background font-bold text-sm border border-border flex items-center justify-center transition-all disabled:opacity-40';

export default function DiscoverPage() {
  const { activities, addActivity, joinActivity, leaveActivity, syncStatus, syncToChain } = useActivities();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { isConnected } = useAccount();

  const handleSync = async () => {
    if (!isConnected || syncing) return;
    setSyncing(true);
    try {
      await syncToChain();
    } finally {
      setSyncing(false);
    }
  };

  const filteredActivities = selectedCategory
    ? activities.filter(a => a.category === selectedCategory)
    : activities;

  const getCategoryInfo = (categoryId: string) => companionTypes.find(c => c.id === categoryId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
        <h2 className="text-[18px] font-black text-foreground">发现搭子</h2>
        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              onClick={handleSync}
              disabled={syncing || syncStatus.isSynced}
              className={`w-8 h-8 rounded-lg flex items-center justify-center border border-border transition-all ${
                syncStatus.isSynced
                  ? 'bg-muted text-foreground'
                  : 'bg-card text-muted-foreground'
              }`}
              title={syncStatus.isSynced ? '已保存到区块链' : '存到链上'}
            >
              {syncing ? (
                <div className="w-3.5 h-3.5 border border-muted-foreground border-t-foreground rounded-full animate-spin" />
              ) : syncStatus.isSynced ? (
                <Globe className="w-4 h-4" />
              ) : (
                <CloudUpload className="w-4 h-4" />
              )}
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center border border-border transition-all">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-32 no-scrollbar">
        {/* Category Pills */}
        <div className="mb-4 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 pb-1">
            <button onClick={() => setSelectedCategory(null)} className={`px-3.5 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-all border transition-all ${!selectedCategory ? 'bg-foreground text-background border-border' : 'bg-card text-muted-foreground border-border'}`}>
              全部
            </button>
            {companionTypes.map(cat => (
              <button key={cat.id} onClick={() => setSelectedCategory(prev => prev === cat.id ? null : cat.id)} className={`px-3.5 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-all border transition-all ${selectedCategory === cat.id ? 'text-white border-border' : 'bg-card text-muted-foreground border-border'}`} style={selectedCategory === cat.id ? { backgroundColor: cat.color } : undefined}>
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Activity Cards */}
        {filteredActivities.length > 0 ? (
          <div className="space-y-2.5">
            {filteredActivities.map((activity, idx) => {
              const cat = getCategoryInfo(activity.category);
              return (
                <motion.div key={activity.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className={CARD_STYLE + ' p-4'}>
                  <div className="flex items-start gap-3">
                    <img src={activity.avatar} alt="" className="w-10 h-10 rounded-full bg-primary border border-border shrink-0 " />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {cat && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: cat.color }}>{cat.icon} {cat.name}</span>}
                        <span className="text-[10px] text-muted-foreground font-medium">{activity.creator}</span>
                      </div>
                      <h4 className="text-[14px] font-bold text-foreground leading-tight mb-1.5">{activity.title}</h4>
                      {activity.description && <p className="text-[12px] text-muted-foreground mb-2 line-clamp-2">{activity.description}</p>}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{activity.location}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{activity.time}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{activity.participants}/{activity.maxParticipants}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => activity.joined ? leaveActivity(activity.id) : joinActivity(activity.id)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold shrink-0 transition-all border transition-all ${activity.joined ? 'bg-muted text-foreground border-border' : 'bg-foreground text-background border-border'}`}
                    >
                      {activity.joined ? <><Check className="w-3 h-3 inline mr-0.5" />已加入</> : '加入'}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="text-[14px] font-black text-muted-foreground mb-3">{selectedCategory ? '未找到' : '暂无'}</div>
            <p className="text-[14px] font-bold text-muted-foreground mb-1">{selectedCategory ? '这个分类还没有活动' : '还没有活动'}</p>
            <p className="text-[12px] text-muted-foreground">点击右上角 + 发起一个吧</p>
          </div>
        )}
      </div>

      {/* Create Activity Drawer */}
      <AnimatePresence>
        {showCreate && <CreateActivityDrawer onClose={() => setShowCreate(false)} onSubmit={(data) => { addActivity(data); setShowCreate(false); }} />}
      </AnimatePresence>
    </div>
  );
}

function CreateActivityDrawer({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [location, setLocation] = useState('');
  const [time, setTime] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('6');
  const [description, setDescription] = useState('');

  const selectedCat = companionTypes.find(c => c.id === category);

  const submit = () => {
    if (!title || !category || !location || !time) return;
    const profile = JSON.parse(localStorage.getItem('vibecard_profile') || '{}');
    onSubmit({
      title,
      category,
      subcategory,
      location,
      time,
      maxParticipants: parseInt(maxParticipants) || 6,
      description,
      creator: profile.name || 'Me',
      avatar: profile.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=Me&backgroundColor=transparent`,
    });
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-foreground/20 z-40" />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[24px] p-5 pt-4 z-50 max-h-[85%] overflow-y-auto border-t border-border ">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[18px] font-black text-foreground">发起活动</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center border border-border transition-all"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">活动标题</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 周末朝阳公园跑步" className={INPUT_STYLE} />
          </div>

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">分类</label>
            <div className="flex flex-wrap gap-2">
              {companionTypes.map(cat => (
                <button key={cat.id} onClick={() => { setCategory(cat.id); setSubcategory(''); }} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border transition-all ${category === cat.id ? 'text-white border-border' : 'bg-card text-muted-foreground border-border'}`} style={category === cat.id ? { backgroundColor: cat.color } : undefined}>
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>
            {selectedCat && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedCat.subcategories.map(sub => (
                  <button key={sub.id} onClick={() => setSubcategory(sub.id)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border transition-all ${subcategory === sub.id ? 'bg-foreground text-background border-border' : 'bg-muted text-muted-foreground border-border'}`}>
                    {sub.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">地点</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="朝阳公园" className={INPUT_STYLE + ' text-[13px] font-medium'} />
            </div>
            <div>
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">时间</label>
              <input value={time} onChange={e => setTime(e.target.value)} placeholder="周六 14:00" className={INPUT_STYLE + ' text-[13px] font-medium'} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">人数上限</label>
            <input type="number" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} className={INPUT_STYLE + ' w-20 text-[13px] font-bold'} />
          </div>

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">描述 (可选)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="活动详情..." className={INPUT_STYLE + ' resize-none h-16 text-[13px] font-medium'} />
          </div>

          <button onClick={submit} disabled={!title || !category || !location || !time} className={BTN_PRIMARY}>
            发布活动
          </button>
        </div>
      </motion.div>
    </>
  );
}
